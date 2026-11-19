import { createHash } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type {
  Attribution,
  AttributionInput,
  Consent,
  ConsentPurpose,
  Interest,
  LandingLeadInput,
  Lead,
  LeadEvent,
  LeadStatus,
} from "@tla/shared";
import { isOpen } from "./lead-status.js";
import { normalizeName } from "./contact.js";

/**
 * Construcción de documentos y decisión de deduplicación de la ingesta de la
 * landing (spec 001, docs/03-registro-de-leads.md «Deduplicación de personas»).
 *
 * Lógica pura: sin Firebase ni SDKs. Los valores por mercado (región telefónica,
 * país, idioma, meses de retención) llegan como parámetros desde la configuración
 * resuelta de la instancia.
 */

/** Ventana de deduplicación: un lead abierto creado hace menos de 90 días se reutiliza. */
export const REENGAGE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Actor de los eventos que escribe la ingesta. */
export const INGEST_ACTOR = "system";

/** Lo que la deduplicación necesita saber del lead existente. */
export interface ExistingLeadSnapshot {
  status: LeadStatus;
  createdAt: Date;
}

/**
 * Un envío se suma al lead existente (evento `reengaged`) si ese lead sigue abierto
 * (no `won`, `lost` ni `invalid`) y se creó hace menos de `REENGAGE_WINDOW_DAYS` días.
 */
export function isReengageable(existing: ExistingLeadSnapshot, now: Date): boolean {
  const age = now.getTime() - existing.createdAt.getTime();
  return isOpen(existing.status) && age < REENGAGE_WINDOW_DAYS * DAY_MS;
}

/** Suma meses en UTC; si el día no existe en el mes destino, usa el último día del mes. */
export function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** `ipHash` del consentimiento: SHA-256 (hex) de la IP seguida del *salt*. La IP no se guarda. */
export function hashIp(ip: string, salt: string): string {
  if (salt === "") throw new Error("hashIp necesita un salt");
  return createHash("sha256")
    .update(ip + salt, "utf8")
    .digest("hex");
}

/** País del teléfono E.164; si no se puede deducir, el país del mercado de la instancia. */
export function phoneCountry(phoneE164: string, fallbackCountry: string): string {
  return parsePhoneNumberFromString(phoneE164)?.country ?? fallbackCountry;
}

/** Atribución de un envío de la landing: la que manda el formulario más el `landingSlug`. */
export function landingAttribution(input: AttributionInput, landingSlug: string): Attribution {
  return { ...input, landingSlug };
}

/** Documento `dedupe/{dedupeKey}`: apunta al último lead creado para esa persona. */
export interface DedupeEntry {
  leadId: string;
  createdAt: Date;
}

/** Valores de la instancia y de la petición que no vienen en el cuerpo. */
export interface NewLandingLeadContext {
  ids: { leadId: string; consentId: string; eventId: string };
  phoneE164: string;
  /** Ya normalizado. */
  email?: string;
  dedupeKey: string;
  now: Date;
  /** `market.country` de la instancia: país por defecto del contacto. */
  marketCountry: string;
  /** `market.locale` de la instancia. */
  locale: string;
  /** `compliance.dataRetentionMonths` de la instancia (fijado por el pack de mercado). */
  dataRetentionMonths: number;
  ipHash?: string;
  userAgent?: string;
}

/**
 * Documentos que crea la transacción de ingesta cuando no hay lead que reutilizar.
 * Es común a todos los orígenes: el lead lleva su `source` y el consentimiento su `channel`.
 */
export interface NewLeadDocs {
  leadId: string;
  lead: Lead;
  consentId: string;
  consent: Consent;
  dedupe: DedupeEntry;
  eventId: string;
  event: LeadEvent;
}

/** Longitud máxima del `userAgent` guardado como evidencia del consentimiento. */
export const USER_AGENT_MAX_LENGTH = 500;

/**
 * Construye lead, consentimiento, entrada de `dedupe` y evento `created` de un envío
 * ya validado. No deja campos `undefined` (Firestore los rechaza).
 */
export function buildNewLandingLead(
  input: LandingLeadInput,
  ctx: NewLandingLeadContext,
): NewLeadDocs {
  const { leadId, consentId, eventId } = ctx.ids;
  const interest: Interest = {
    tourIds: input.tourIds,
    ...(input.travelMonth !== undefined && { travelMonth: input.travelMonth }),
    ...(input.pax !== undefined && { pax: input.pax }),
  };
  const lead: Lead = {
    leadId,
    dedupeKey: ctx.dedupeKey,
    source: "landing",
    status: "new",
    contact: {
      name: normalizeName(input.name),
      phoneE164: ctx.phoneE164,
      ...(ctx.email !== undefined && { email: ctx.email }),
      country: phoneCountry(ctx.phoneE164, ctx.marketCountry),
      language: ctx.locale,
    },
    interest,
    attribution: {
      ...landingAttribution(input.attribution, input.landingSlug),
      firstTouchAt: ctx.now,
    },
    consentId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    retentionUntil: addMonthsUtc(ctx.now, ctx.dataRetentionMonths),
  };
  const purposes: ConsentPurpose[] = input.consent.marketing
    ? ["contact", "marketing"]
    : ["contact"];
  const consent: Consent = {
    leadId,
    purposes,
    textVersion: input.consent.textVersion,
    channel: "landing",
    grantedAt: ctx.now,
    ...(ctx.ipHash !== undefined && { ipHash: ctx.ipHash }),
    ...(ctx.userAgent !== undefined &&
      ctx.userAgent !== "" && { userAgent: ctx.userAgent.slice(0, USER_AGENT_MAX_LENGTH) }),
  };
  return {
    leadId,
    lead,
    consentId,
    consent,
    dedupe: { leadId, createdAt: ctx.now },
    eventId,
    event: { type: "created", actor: INGEST_ACTOR, at: ctx.now },
  };
}

/** Evento `reengaged`: guarda la atribución del nuevo envío; la del lead no se toca. */
export function buildReengagedEvent(input: LandingLeadInput, now: Date): LeadEvent {
  return {
    type: "reengaged",
    actor: INGEST_ACTOR,
    at: now,
    attribution: landingAttribution(input.attribution, input.landingSlug),
  };
}
