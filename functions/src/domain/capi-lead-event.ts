// Evento `Lead` de la Conversions API de Meta (ticket #17, spec 003). Lógica pura:
// decide si hay evento y qué identificadores lleva según el consentimiento.
import { createHash } from "node:crypto";
import type { Attribution, ConsentPurpose } from "@tla/shared";

/** Nombre del evento estándar de Meta. */
export const CAPI_LEAD_EVENT_NAME = "Lead";
/** Origen del evento: el lead llega desde un formulario web. */
export const CAPI_ACTION_SOURCE = "website";

/**
 * `user_data` del evento. Meta exige el objeto aunque vaya vacío: sin consentimiento
 * de marketing ni `fbc`/`fbp` se envía `{}` (Meta puede rechazar el evento por falta
 * de identificadores; ese rechazo es un 4xx definitivo, sin reintento).
 * No se envían IP, *user agent*, nombre ni otros campos.
 */
export interface CapiUserData {
  /** Email normalizado (trim + minúsculas) en SHA-256 hex. Solo con consentimiento de marketing. */
  em?: [string];
  /** Teléfono E.164 sin `+` (solo dígitos) en SHA-256 hex. Solo con consentimiento de marketing. */
  ph?: [string];
  /** Cookie `_fbc` del Pixel; va siempre que exista (no es un dato de contacto). */
  fbc?: string;
  /** Cookie `_fbp` del Pixel; va siempre que exista. */
  fbp?: string;
}

export interface CapiLeadEvent {
  event_name: typeof CAPI_LEAD_EVENT_NAME;
  /** El mismo `eventId` que envió el Pixel: Meta deduplica navegador y servidor con él. */
  event_id: string;
  /** Segundos Unix (entero). */
  event_time: number;
  action_source: typeof CAPI_ACTION_SOURCE;
  user_data: CapiUserData;
}

/** Consentimiento del lead (documento `consents/{consentId}`), o `null` si no consta. */
export interface CapiConsent {
  purposes: readonly ConsentPurpose[];
  withdrawnAt?: Date;
}

/** Datos del lead que usa el evento. */
export interface CapiLeadInput {
  attribution: Pick<Attribution, "eventId" | "fbc" | "fbp">;
  contact: { email?: string; phoneE164?: string };
  createdAt: Date;
  consent: CapiConsent | null;
}

export type CapiLeadEventResult = { event: CapiLeadEvent } | { skip: "no_event_id" };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Normalización de Meta para `em`: sin espacios alrededor y en minúsculas. */
export function normalizeCapiEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalización de Meta para `ph`: solo dígitos, con el prefijo de país y sin `+`. */
export function normalizeCapiPhone(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}

/** `true` si el consentimiento incluye `marketing` y no se ha retirado. */
export function hasMarketingConsent(consent: CapiConsent | null): boolean {
  return (
    consent !== null && consent.withdrawnAt === undefined && consent.purposes.includes("marketing")
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/**
 * Evento `Lead` para la CAPI, o el motivo para no enviarlo:
 * - sin `attribution.eventId` → `{ skip: "no_event_id" }` (sin él no se deduplica con el
 *   Pixel; es el caso de los leads de Lead Ads);
 * - `em`/`ph` solo con consentimiento de marketing; `fbc`/`fbp` siempre que existan.
 */
export function buildCapiLeadEvent(lead: CapiLeadInput): CapiLeadEventResult {
  const eventId = nonEmpty(lead.attribution.eventId);
  if (eventId === undefined) return { skip: "no_event_id" };

  const userData: CapiUserData = {};
  if (hasMarketingConsent(lead.consent)) {
    const email = nonEmpty(lead.contact.email);
    if (email !== undefined) userData.em = [sha256Hex(normalizeCapiEmail(email))];
    const phone = nonEmpty(lead.contact.phoneE164);
    if (phone !== undefined) {
      const digits = normalizeCapiPhone(phone);
      if (digits !== "") userData.ph = [sha256Hex(digits)];
    }
  }
  const fbc = nonEmpty(lead.attribution.fbc);
  if (fbc !== undefined) userData.fbc = fbc;
  const fbp = nonEmpty(lead.attribution.fbp);
  if (fbp !== undefined) userData.fbp = fbp;

  return {
    event: {
      event_name: CAPI_LEAD_EVENT_NAME,
      event_id: eventId,
      event_time: Math.floor(lead.createdAt.getTime() / 1000),
      action_source: CAPI_ACTION_SOURCE,
      user_data: userData,
    },
  };
}
