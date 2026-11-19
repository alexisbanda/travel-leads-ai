// Ingesta del formulario de las landings (docs/specs/001-ingesta-lead-landing.md):
// App Check → honeypot → validación Zod → normalización y `dedupeKey` → transacción
// (lead nuevo o evento `reengaged`) → `200 { leadId, deduplicated }`.
//
// Los logs solo llevan `leadId` y `landingSlug` (y, en un 400, los nombres de los
// campos inválidos): nunca nombre, teléfono, email ni IP.
import { getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { LandingLeadInput, TextVersion, type ResolvedInstanceConfig } from "@tla/shared";
import { normalizeEmail, normalizePhone } from "../domain/contact.js";
import { dedupeKey } from "../domain/dedupe-key.js";
import { buildNewLandingLead, buildReengagedEvent, hashIp } from "../domain/landing-lead.js";
import { matchesVerifyToken } from "../domain/meta-signature.js";
import { ulid } from "../domain/ulid.js";
import {
  createRunIngestTransaction,
  type IngestOutcome,
  type IngestTransactionRequest,
} from "../integrations/landing-lead-store.js";

/** `SecretParam` no se exporta desde `firebase-functions/params`. */
type Secret = ReturnType<typeof defineSecret>;

/** *Salt* de `ipHash` (Secret Manager). */
export const IP_HASH_SALT: Secret = defineSecret("IP_HASH_SALT");
/**
 * Token de depuración de App Check, aceptado **solo** con `FUNCTIONS_EMULATOR=true`
 * (en local, `functions/.secret.local`). Fuera del emulador no se lee.
 */
export const APP_CHECK_EMULATOR_TOKEN: Secret = defineSecret("APP_CHECK_EMULATOR_TOKEN");

/** Cabecera con el token de App Check que envía la landing. */
export const APP_CHECK_HEADER = "X-Firebase-AppCheck";
/** Longitud máxima del `landingSlug` que se escribe en los logs. */
const LOG_SLUG_MAX_LENGTH = 100;

/** Valores de la instancia que usa la ingesta (salen de la configuración resuelta). */
export interface IngestLandingLeadSettings {
  phoneDefaultRegion: string;
  marketCountry: string;
  locale: string;
  dataRetentionMonths: number;
}

/** Campos permitidos en los logs: nada de datos personales. */
export interface IngestLogFields {
  leadId?: string;
  landingSlug?: string;
  /** Rutas de los campos inválidos (p. ej. `consent.contact`), nunca sus valores. */
  fields?: string[];
  errorName?: string;
}

export interface IngestLogger {
  info(message: string, fields?: IngestLogFields): void;
  warn(message: string, fields?: IngestLogFields): void;
  error(message: string, fields?: IngestLogFields): void;
}

export interface IngestLandingLeadDeps {
  /** Se resuelve en cada petición para no leer la configuración al cargar el módulo. */
  settings(): IngestLandingLeadSettings;
  verifyAppCheck(token: string): Promise<boolean>;
  ipHashSalt(): string;
  /** ULID nuevo (lead, consentimiento, evento y `leadId` falso del honeypot). */
  newId(): string;
  now(): Date;
  runIngestTransaction(request: IngestTransactionRequest): Promise<IngestOutcome>;
  log: IngestLogger;
}

/** Interfaz mínima de la petición (compatible con la de `firebase-functions/v2/https`). */
export interface IngestRequest {
  method: string;
  body?: unknown;
  ip?: string;
  get(name: string): string | undefined;
}

/** Interfaz mínima de la respuesta (compatible con la de Express). */
export interface IngestResponse {
  status(code: number): IngestResponse;
  set(field: string, value: string): IngestResponse;
  json(body: unknown): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `landingSlug` apto para logs, o `undefined` si el cuerpo no trae uno. */
function slugForLogs(body: unknown): string | undefined {
  const slug = isRecord(body) ? body.landingSlug : undefined;
  return typeof slug === "string" && slug !== "" ? slug.slice(0, LOG_SLUG_MAX_LENGTH) : undefined;
}

/** IP del cliente (`req.ip` de Express o, si falta, la primera de `X-Forwarded-For`). */
function clientIp(req: IngestRequest): string | undefined {
  if (req.ip !== undefined && req.ip !== "") return req.ip;
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && forwarded !== "" ? forwarded : undefined;
}

export function createIngestLandingLeadHandler(deps: IngestLandingLeadDeps) {
  return async function ingestLandingLeadHandler(
    req: IngestRequest,
    res: IngestResponse,
  ): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).set("Allow", "POST").json({ error: "method_not_allowed" });
      return;
    }

    const landingSlug = slugForLogs(req.body);
    try {
      const token = req.get(APP_CHECK_HEADER);
      if (token === undefined || token === "" || !(await deps.verifyAppCheck(token))) {
        deps.log.warn("ingestLandingLead: app_check_rejected", { landingSlug });
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      // Honeypot antes de Zod (comentario del issue #12): el bot recibe un 200 creíble.
      const body = req.body;
      if (isRecord(body) && typeof body.website === "string" && body.website !== "") {
        deps.log.info("ingestLandingLead: spam_blocked", { landingSlug });
        res.status(200).json({ leadId: deps.newId(), deduplicated: false });
        return;
      }

      const parsed = LandingLeadInput.safeParse(body);
      if (!parsed.success) {
        const fields = [
          ...new Set(
            parsed.error.issues.map((issue) =>
              issue.path.length > 0 ? issue.path.join(".") : "body",
            ),
          ),
        ];
        deps.log.warn("ingestLandingLead: validation_failed", { landingSlug, fields });
        res.status(400).json({ error: "validation", fields });
        return;
      }
      const input = parsed.data;
      if (!TextVersion.safeParse(input.consent.textVersion).success) {
        const fields = ["consent.textVersion"];
        deps.log.warn("ingestLandingLead: validation_failed", { landingSlug, fields });
        res.status(400).json({ error: "validation", fields });
        return;
      }

      const settings = deps.settings();
      const phone = normalizePhone(input.phone, settings.phoneDefaultRegion);
      if (!phone.ok) {
        const fields = ["phone"];
        deps.log.warn("ingestLandingLead: validation_failed", { landingSlug, fields });
        res.status(400).json({ error: "validation", fields });
        return;
      }

      const now = deps.now();
      const ip = clientIp(req);
      const key = dedupeKey({ phoneE164: phone.value });
      const newLead = buildNewLandingLead(input, {
        ids: { leadId: deps.newId(), consentId: deps.newId(), eventId: deps.newId() },
        phoneE164: phone.value,
        ...(input.email !== undefined && { email: normalizeEmail(input.email) }),
        dedupeKey: key,
        now,
        marketCountry: settings.marketCountry,
        locale: settings.locale,
        dataRetentionMonths: settings.dataRetentionMonths,
        ...(ip !== undefined && { ipHash: hashIp(ip, deps.ipHashSalt()) }),
        ...(req.get("user-agent") !== undefined && { userAgent: req.get("user-agent") }),
      });

      const outcome = await deps.runIngestTransaction({
        dedupeKey: key,
        now,
        newLead,
        reengaged: { eventId: deps.newId(), event: buildReengagedEvent(input, now) },
      });

      deps.log.info(
        outcome.deduplicated
          ? "ingestLandingLead: lead_reengaged"
          : "ingestLandingLead: lead_created",
        { leadId: outcome.leadId, landingSlug },
      );
      res.status(200).json({ leadId: outcome.leadId, deduplicated: outcome.deduplicated });
    } catch (error) {
      // Solo el nombre del error: el mensaje podría arrastrar datos del envío.
      deps.log.error("ingestLandingLead: unexpected_error", {
        landingSlug,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      res.status(500).json({ error: "internal" });
    }
  };
}

export interface AppCheckVerifierOptions {
  /** Verificación real; debe rechazar (lanzar) si el token no es válido. */
  verifyToken(token: string): Promise<unknown>;
  /** Token de depuración; solo se consulta dentro del emulador. */
  emulatorToken(): string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Verificador de App Check. `onRequest` no admite `enforceAppCheck` (es de las
 * funciones callable), así que el token de `X-Firebase-AppCheck` se verifica aquí.
 * Dentro del emulador (`FUNCTIONS_EMULATOR === "true"`) acepta además el token de
 * depuración `APP_CHECK_EMULATOR_TOKEN`, comparado en tiempo constante. Fuera del
 * emulador ese camino no existe.
 */
export function createAppCheckVerifier(options: AppCheckVerifierOptions) {
  const env = options.env ?? process.env;
  return async function verifyAppCheck(token: string): Promise<boolean> {
    if (env.FUNCTIONS_EMULATOR === "true" && matchesVerifyToken(token, options.emulatorToken())) {
      return true;
    }
    try {
      await options.verifyToken(token);
      return true;
    } catch {
      return false;
    }
  };
}

function adminApp() {
  return getApps()[0] ?? initializeApp();
}

/** Valores de la instancia que necesita la ingesta. */
export function ingestSettingsFrom(config: ResolvedInstanceConfig): IngestLandingLeadSettings {
  return {
    phoneDefaultRegion: config.market.phoneDefaultRegion,
    marketCountry: config.market.country,
    locale: config.market.locale,
    dataRetentionMonths: config.compliance.dataRetentionMonths,
  };
}

/**
 * Construye la Cloud Function. Es una fábrica porque `onRequest` fija las opciones
 * globales al definirse: `index.ts` la llama tras `setGlobalOptions({ region })`.
 * CORS: `true` (refleja el origen) porque la configuración de la instancia aún no
 * declara los orígenes de las landings; la protección real es App Check.
 */
export function createIngestLandingLeadFunction(config: ResolvedInstanceConfig) {
  let settings: IngestLandingLeadSettings | undefined;
  return onRequest(
    { cors: true, secrets: [IP_HASH_SALT, APP_CHECK_EMULATOR_TOKEN] },
    createIngestLandingLeadHandler({
      settings: () => (settings ??= ingestSettingsFrom(config)),
      verifyAppCheck: createAppCheckVerifier({
        verifyToken: (token) => getAppCheck(adminApp()).verifyToken(token),
        emulatorToken: () => APP_CHECK_EMULATOR_TOKEN.value(),
      }),
      ipHashSalt: () => IP_HASH_SALT.value(),
      newId: () => ulid(),
      now: () => new Date(),
      runIngestTransaction: createRunIngestTransaction(),
      // Acceso perezoso a `logger`: no se resuelve al definir la función.
      log: {
        info: (message, fields) => logger.info(message, fields),
        warn: (message, fields) => logger.warn(message, fields),
        error: (message, fields) => logger.error(message, fields),
      },
    }),
  );
}
