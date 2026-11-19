// `processMetaInbox` (docs/specs/004-meta-lead-ads-ingesta.md): convierte cada entrega
// de Meta Lead Ads guardada en `inbox/meta_<leadgen_id>` en un lead. Graph API →
// mapeo puro (`domain/meta-lead.ts`) → transacción de ingesta común con la landing,
// con el documento de `inbox` como marcador de idempotencia.
//
// Logs: solo `inboxId`, `leadId`, resultado, código y nombre del error, y claves de
// preguntas descartadas. Nunca nombre, teléfono, email ni respuestas de la Graph API.
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import type { ResolvedInstanceConfig } from "@tla/shared";
import { buildMetaLeadIngest, type MetaLeadSettings } from "../domain/meta-lead.js";
import { ulid } from "../domain/ulid.js";
import { INBOX_COLLECTION, META_INBOX_PREFIX } from "../http/meta-lead-webhook.js";
import {
  createRunIngestTransaction,
  type IngestOutcome,
  type IngestTransactionRequest,
} from "../integrations/landing-lead-store.js";
import { createMetaGraphApiClient, MetaGraphApiError } from "../integrations/meta-graph-api.js";

/** Estados de un documento de `inbox`. Ausente equivale a `pending`. */
export type InboxStatus = "pending" | "processed" | "error";

/** Resultado de procesar una escritura en `inbox`. */
export type ProcessMetaInboxResult =
  "ignored" | "created" | "reengaged" | "already_processed" | "error";

/** Campos permitidos en los logs: nada de datos personales. */
export interface ProcessMetaInboxLogFields {
  inboxId: string;
  leadId?: string;
  result?: ProcessMetaInboxResult;
  error?: string;
  errorName?: string;
  /** Claves de preguntas descartadas, nunca sus respuestas. */
  discardedKeys?: string[];
}

export interface ProcessMetaInboxDeps {
  /** Se resuelve en cada evento para no leer la configuración al cargar el módulo. */
  settings(): MetaLeadSettings;
  /** JSON del lead en la Graph API. Lanza `MetaGraphApiError` si falla. */
  fetchLead(leadgenId: string): Promise<unknown>;
  newId(): string;
  now(): Date;
  runIngestTransaction(request: IngestTransactionRequest): Promise<IngestOutcome>;
  /** Marca el inbox `status: "error"` con el código y suma un intento. */
  markInboxError(inboxId: string, error: string, at: Date): Promise<void>;
  log: {
    info(message: string, fields: ProcessMetaInboxLogFields): void;
    warn(message: string, fields: ProcessMetaInboxLogFields): void;
    error(message: string, fields: ProcessMetaInboxLogFields): void;
  };
}

/** Lo que se usa del evento: ID del documento y datos tras la escritura (`undefined` si se borró). */
export interface InboxWrite {
  inboxId: string;
  after: Record<string, unknown> | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Solo se procesan entregas de Meta pendientes: así las escrituras del propio trigger
 * (`processed`, `error`) no lo vuelven a disparar.
 */
export function shouldProcessInbox(write: InboxWrite): boolean {
  const { after } = write;
  if (after === undefined || !write.inboxId.startsWith(META_INBOX_PREFIX)) return false;
  if (after.source !== "meta") return false;
  return after.status === undefined || after.status === "pending";
}

/** `leadgen_id` del payload del webhook, si es una cadena de dígitos. */
export function leadgenIdOf(doc: Record<string, unknown>): string | undefined {
  const payload = doc.payload;
  const id = isRecord(payload) ? payload.leadgen_id : undefined;
  return typeof id === "string" && /^[0-9]+$/.test(id) ? id : undefined;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export function createProcessMetaInboxHandler(deps: ProcessMetaInboxDeps) {
  return async function processMetaInbox(write: InboxWrite): Promise<ProcessMetaInboxResult> {
    if (!shouldProcessInbox(write)) return "ignored";
    const { inboxId } = write;
    const now = deps.now();

    const fail = async (code: string): Promise<ProcessMetaInboxResult> => {
      deps.log.warn("processMetaInbox: error", { inboxId, result: "error", error: code });
      await deps.markInboxError(inboxId, code, now);
      return "error";
    };

    const leadgenId = leadgenIdOf(write.after ?? {});
    if (leadgenId === undefined) return fail("missing_leadgen_id");

    let graphLead: unknown;
    try {
      graphLead = await deps.fetchLead(leadgenId);
    } catch (error) {
      if (error instanceof MetaGraphApiError) return fail(error.code);
      deps.log.error("processMetaInbox: unexpected_error", {
        inboxId,
        errorName: errorName(error),
      });
      return fail("internal_error");
    }

    const built = buildMetaLeadIngest(graphLead, {
      ids: {
        leadId: deps.newId(),
        consentId: deps.newId(),
        eventId: deps.newId(),
        reengagedEventId: deps.newId(),
      },
      now,
      settings: deps.settings(),
    });
    if (built.discardedKeys.length > 0) {
      deps.log.warn("processMetaInbox: fields_discarded", {
        inboxId,
        discardedKeys: built.discardedKeys,
      });
    }
    if (!built.ok) return fail(built.error);

    let outcome: IngestOutcome;
    try {
      outcome = await deps.runIngestTransaction({
        ...built.ingest,
        now,
        inbox: { collection: INBOX_COLLECTION, id: inboxId },
      });
    } catch (error) {
      // Queda visible y reintentable en el inbox; si tampoco se puede marcar, se lanza.
      deps.log.error("processMetaInbox: unexpected_error", {
        inboxId,
        errorName: errorName(error),
      });
      return fail("internal_error");
    }

    const result: ProcessMetaInboxResult = outcome.alreadyProcessed
      ? "already_processed"
      : outcome.deduplicated
        ? "reengaged"
        : "created";
    deps.log.info(`processMetaInbox: ${result}`, { inboxId, leadId: outcome.leadId, result });
    return result;
  };
}

/** `markInboxError` sobre Firestore. */
export function createFirestoreInboxErrorMarker(db: () => Firestore) {
  return async (inboxId: string, error: string, at: Date): Promise<void> => {
    await db()
      .collection(INBOX_COLLECTION)
      .doc(inboxId)
      .update({
        status: "error" satisfies InboxStatus,
        attempts: FieldValue.increment(1),
        error,
        lastAttemptAt: at,
      });
  };
}

/** Nombre del secreto de una referencia `secret:NOMBRE`. */
export function secretName(ref: string): string {
  return ref.replace(/^secret:/, "");
}

/** Valores de la instancia que usa el mapeo. */
export function metaLeadSettingsFrom(config: ResolvedInstanceConfig): MetaLeadSettings {
  return {
    phoneDefaultRegion: config.market.phoneDefaultRegion,
    marketCountry: config.market.country,
    locale: config.market.locale,
    dataRetentionMonths: config.compliance.dataRetentionMonths,
    legalTextsVersion: config.compliance.legalTextsVersion,
    fieldMap: config.channels.meta.leadForm?.fieldMap ?? {},
  };
}

function defaultDb(): Firestore {
  return getFirestore(getApps()[0] ?? initializeApp());
}

/**
 * Trigger de Firestore. Es una fábrica porque `onDocumentWritten` fija las opciones
 * globales al definirse: `index.ts` la llama tras `setGlobalOptions({ region })`. Sin
 * `retry`: los errores quedan en el inbox (`status: "error"`) y se reintentan
 * volviendo a `pending`.
 */
export function createProcessMetaInboxFunction(config: ResolvedInstanceConfig) {
  const pageToken = defineSecret(secretName(config.channels.meta.pageTokenSecret));
  let settings: MetaLeadSettings | undefined;
  const graph = createMetaGraphApiClient({ accessToken: () => pageToken.value() });
  const handler = createProcessMetaInboxHandler({
    settings: () => (settings ??= metaLeadSettingsFrom(config)),
    fetchLead: (leadgenId) => graph.fetchLead(leadgenId),
    newId: () => ulid(),
    now: () => new Date(),
    runIngestTransaction: createRunIngestTransaction(),
    markInboxError: createFirestoreInboxErrorMarker(defaultDb),
    // Acceso perezoso a `logger`: no se resuelve al definir la función.
    log: {
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warn(message, fields),
      error: (message, fields) => logger.error(message, fields),
    },
  });
  return onDocumentWritten(
    { document: `${INBOX_COLLECTION}/{inboxId}`, secrets: [pageToken] },
    async (event) => {
      const after = event.data?.after;
      await handler({
        inboxId: event.params.inboxId,
        after: after?.exists === true ? after.data() : undefined,
      });
    },
  );
}
