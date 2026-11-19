// Webhook de Meta Lead Ads (docs/03-registro-de-leads.md, «Patrón de webhook»):
// - GET: verificación de la suscripción con `META_VERIFY_TOKEN`.
// - POST: firma `X-Hub-Signature-256` con `META_APP_SECRET` y guardado idempotente
//   de cada `leadgen_id` en `inbox/meta_{leadgen_id}`. El procesamiento lo hace
//   después un trigger sobre `inbox`.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import {
  extractLeadgenChanges,
  isValidMetaSignature,
  matchesVerifyToken,
} from "../domain/meta-signature.js";

/** `SecretParam` no se exporta desde `firebase-functions/params`. */
type Secret = ReturnType<typeof defineSecret>;

export const META_APP_SECRET: Secret = defineSecret("META_APP_SECRET");
export const META_VERIFY_TOKEN: Secret = defineSecret("META_VERIFY_TOKEN");

/** Colección de entregas crudas pendientes de procesar. */
export const INBOX_COLLECTION = "inbox";
/** Prefijo del ID de documento en `inbox` para entregas de Meta. */
export const META_INBOX_PREFIX = "meta_";
/**
 * Vida de un documento de `inbox`: 7 días (docs/03-registro-de-leads.md, «Guardar el
 * payload crudo en `inbox/{deliveryId}` (TTL de 7 días)»). La política TTL sobre
 * `inbox.expiresAt` está declarada en `firestore.indexes.json`.
 */
export const INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Documento de `inbox` tal como lo escribe el webhook. */
export interface MetaInboxDoc {
  source: "meta";
  /** `value` del cambio `leadgen` de la entrega (ids de página, formulario, anuncio y lead). */
  payload: Record<string, unknown>;
  receivedAt: Date;
  expiresAt: Date;
}

export interface MetaLeadWebhookDeps {
  verifyToken(): string;
  appSecret(): string;
  /** Crea `inbox/{id}` si no existe. Nunca sobrescribe. */
  saveInboxIfAbsent(id: string, doc: MetaInboxDoc): Promise<"created" | "exists">;
  now(): Date;
  /** Registro de errores inesperados. No debe recibir el payload (datos personales). */
  logError?(message: string, error: unknown): void;
}

/** Interfaz mínima de la petición (compatible con la de `firebase-functions/v2/https`). */
export interface WebhookRequest {
  method: string;
  query: Record<string, unknown>;
  rawBody?: Buffer;
  get(name: string): string | undefined;
}

/** Interfaz mínima de la respuesta (compatible con la de Express). */
export interface WebhookResponse {
  status(code: number): WebhookResponse;
  set(field: string, value: string): WebhookResponse;
  send(body: string): unknown;
}

function reply(res: WebhookResponse, code: number, body: string): void {
  res.status(code).set("Content-Type", "text/plain; charset=utf-8").send(body);
}

export function createMetaLeadWebhookHandler(deps: MetaLeadWebhookDeps) {
  return async function metaLeadWebhookHandler(
    req: WebhookRequest,
    res: WebhookResponse,
  ): Promise<void> {
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const challenge = req.query["hub.challenge"];
      if (
        mode === "subscribe" &&
        typeof challenge === "string" &&
        matchesVerifyToken(req.query["hub.verify_token"], deps.verifyToken())
      ) {
        reply(res, 200, challenge);
      } else {
        reply(res, 403, "Forbidden");
      }
      return;
    }

    if (req.method !== "POST") {
      reply(res, 405, "Method Not Allowed");
      return;
    }

    const rawBody = req.rawBody;
    if (
      !rawBody ||
      !isValidMetaSignature(rawBody, req.get("x-hub-signature-256"), deps.appSecret())
    ) {
      reply(res, 401, "Unauthorized");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      reply(res, 400, "Bad Request");
      return;
    }

    // Se escribe antes de responder: tras la respuesta la instancia puede congelarse.
    try {
      const receivedAt = deps.now();
      const expiresAt = new Date(receivedAt.getTime() + INBOX_TTL_MS);
      for (const { leadgenId, value } of extractLeadgenChanges(payload)) {
        await deps.saveInboxIfAbsent(META_INBOX_PREFIX + leadgenId, {
          source: "meta",
          payload: value,
          receivedAt,
          expiresAt,
        });
      }
    } catch (error) {
      // 500 para que Meta reintente; la escritura es idempotente.
      deps.logError?.("metaLeadWebhook: no se pudo guardar la entrega en inbox", error);
      reply(res, 500, "Internal Server Error");
      return;
    }

    reply(res, 200, "OK");
  };
}

/** Código gRPC `ALREADY_EXISTS`, que devuelve `create()` si el documento ya existe. */
const GRPC_ALREADY_EXISTS = 6;

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

export async function saveInboxIfAbsent(
  id: string,
  doc: MetaInboxDoc,
): Promise<"created" | "exists"> {
  try {
    await db()
      .collection(INBOX_COLLECTION)
      .doc(id)
      .create({
        ...doc,
        receivedAt: Timestamp.fromDate(doc.receivedAt),
        expiresAt: Timestamp.fromDate(doc.expiresAt),
      });
    return "created";
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === GRPC_ALREADY_EXISTS) return "exists";
    throw error;
  }
}

/**
 * Construye la Cloud Function. Es una fábrica (y no una constante del módulo) porque
 * `onRequest` fija las opciones globales al definirse: `index.ts` la llama después de
 * `setGlobalOptions({ region })` para que la función herede la región de la instancia.
 */
export function createMetaLeadWebhookFunction() {
  return onRequest(
    { secrets: [META_APP_SECRET, META_VERIFY_TOKEN] },
    createMetaLeadWebhookHandler({
      verifyToken: () => META_VERIFY_TOKEN.value(),
      appSecret: () => META_APP_SECRET.value(),
      saveInboxIfAbsent,
      now: () => new Date(),
      logError: (message, error) =>
        logger.error(message, { error: error instanceof Error ? error.message : String(error) }),
    }),
  );
}
