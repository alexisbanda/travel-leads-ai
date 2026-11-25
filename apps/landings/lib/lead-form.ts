import type { LandingLeadInput, ResolvedInstanceConfig } from "@tla/shared";
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { readAttribution, type SearchParamsLike } from "./attribution.js";
import type { AppCheckWebConfig, GetAppCheckToken } from "./app-check.js";

/**
 * Núcleo puro del formulario de lead: validación en cliente, cuerpo de
 * `ingestLandingLead` (spec 001, `LandingLeadInput`) y envío. Sin estado
 * persistente ni logs: los valores del viajero nunca salen a la consola.
 */

export type LeadFormTexts = ResolvedInstanceConfig["marketPack"]["landingUi"]["form"];
export type LegalTexts = ResolvedInstanceConfig["marketPack"]["legalTexts"];

/** Valores del formulario tal como los escribe el viajero. */
export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  /** `YYYY-MM` (input `type="month"`) o vacío. */
  travelMonth: string;
  adults: string;
  children: string;
  consentContact: boolean;
  consentMarketing: boolean;
  /** Honeypot: vacío para personas. */
  website: string;
}

export const EMPTY_LEAD_FORM_VALUES: LeadFormValues = {
  name: "",
  phone: "",
  email: "",
  travelMonth: "",
  adults: "",
  children: "",
  consentContact: false,
  consentMarketing: false,
  website: "",
};

export type LeadFormField = "name" | "phone" | "email" | "travelMonth" | "adults" | "children" | "consentContact";

/** Mensaje de error por campo del formulario. */
export type LeadFormErrors = Partial<Record<LeadFormField, string>>;

export interface ValidateOptions {
  phoneDefaultRegion: string;
  texts: LeadFormTexts;
}

const NAME_MIN = 2;
const NAME_MAX = 80;
/** Rangos de personas de `LandingLeadInput.pax`. */
export const ADULTS = { min: 1, max: 20 } as const;
export const CHILDREN = { min: 0, max: 10 } as const;
const MAX_TOUR_IDS = 5;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function countryOf(region: string): CountryCode | undefined {
  return isSupportedCountry(region) ? region : undefined;
}

/** Teléfono en E.164 si es válido con la región por defecto del mercado; si no, `undefined`. */
export function normalizeLeadPhone(phone: string, phoneDefaultRegion: string): string | undefined {
  const parsed = parsePhoneNumberFromString(phone.trim(), countryOf(phoneDefaultRegion));
  return parsed?.isValid() ? parsed.number : undefined;
}

function parseCount(value: string, range: { min: number; max: number }): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const count = Number(value.trim());
  return count >= range.min && count <= range.max ? count : undefined;
}

/**
 * Valida en cliente con los textos de `landingUi.form`. Los opcionales mal
 * formados (mes, personas) usan `errorRequired`: el pack no tiene un texto
 * de formato específico.
 */
export function validateLeadForm(values: LeadFormValues, { phoneDefaultRegion, texts }: ValidateOptions): {
  fields: LeadFormErrors;
} {
  const fields: LeadFormErrors = {};
  const name = values.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) fields.name = texts.errorRequired;

  if (values.phone.trim() === "") fields.phone = texts.errorRequired;
  else if (normalizeLeadPhone(values.phone, phoneDefaultRegion) === undefined) fields.phone = texts.errorPhone;

  const email = values.email.trim();
  if (email !== "" && !EMAIL.test(email)) fields.email = texts.errorEmail;

  if (values.travelMonth !== "" && !MONTH.test(values.travelMonth)) fields.travelMonth = texts.errorRequired;

  const adults = values.adults.trim();
  const children = values.children.trim();
  if (adults === "" ? children !== "" : parseCount(adults, ADULTS) === undefined) fields.adults = texts.errorRequired;
  if (children !== "" && parseCount(children, CHILDREN) === undefined) fields.children = texts.errorRequired;

  if (!values.consentContact) fields.consentContact = texts.errorConsent;
  return { fields };
}

export interface BuildLeadBodyContext {
  landingSlug: string;
  tourIds?: readonly string[];
  legalTexts: Pick<LegalTexts, "version">;
  phoneDefaultRegion: string;
  /** Query string de la visita (en memoria). */
  searchParams: SearchParamsLike;
  /** UUID nuevo por envío; también va en `attribution.eventId`. */
  eventId: string;
}

/** Cuerpo de `ingestLandingLead` (spec 001). Llamar solo con valores ya validados. */
export function buildLeadBody(values: LeadFormValues, ctx: BuildLeadBodyContext): LandingLeadInput {
  const email = values.email.trim();
  const adults = values.adults.trim();
  const children = values.children.trim();
  return {
    name: values.name.trim(),
    phone: normalizeLeadPhone(values.phone, ctx.phoneDefaultRegion) ?? values.phone.trim(),
    ...(email !== "" ? { email } : {}),
    ...(values.travelMonth !== "" ? { travelMonth: values.travelMonth } : {}),
    ...(adults !== "" ? { pax: { adults: Number(adults), children: children === "" ? 0 : Number(children) } } : {}),
    tourIds: [...(ctx.tourIds ?? [])].slice(0, MAX_TOUR_IDS),
    landingSlug: ctx.landingSlug,
    attribution: { ...readAttribution(ctx.searchParams), eventId: ctx.eventId },
    consent: { contact: true, marketing: values.consentMarketing, textVersion: ctx.legalTexts.version },
    website: values.website,
  };
}

export type SubmitResult = { ok: true } | { ok: false; fields?: LeadFormErrors; generic?: boolean };

export interface SubmitOptions {
  endpoint: string;
  getAppCheckToken: GetAppCheckToken;
  texts: LeadFormTexts;
  /** Por defecto, el `fetch` global. */
  fetch?: typeof fetch;
  /** Tiempo máximo de la petición (ms). */
  timeoutMs?: number;
}

export const APP_CHECK_HEADER = "X-Firebase-AppCheck";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Ruta de campo del servidor (`issue.path.join(".")`) → campo del formulario. */
const SERVER_FIELDS: Readonly<Record<string, LeadFormField>> = {
  name: "name",
  phone: "phone",
  email: "email",
  travelMonth: "travelMonth",
  pax: "adults",
  "pax.adults": "adults",
  "pax.children": "children",
  consent: "consentContact",
  "consent.contact": "consentContact",
};

function messageFor(field: LeadFormField, texts: LeadFormTexts): string {
  switch (field) {
    case "phone":
      return texts.errorPhone;
    case "email":
      return texts.errorEmail;
    case "consentContact":
      return texts.errorConsent;
    default:
      return texts.errorRequired;
  }
}

/** Traduce `fields` de un 400; cualquier ruta sin campo visible (p. ej. `consent.textVersion`) es genérica. */
export function mapServerFields(serverFields: unknown, texts: LeadFormTexts): { fields: LeadFormErrors; generic: boolean } {
  const fields: LeadFormErrors = {};
  let generic = !Array.isArray(serverFields) || serverFields.length === 0;
  for (const path of Array.isArray(serverFields) ? serverFields : []) {
    const field = typeof path === "string" ? SERVER_FIELDS[path] : undefined;
    if (field === undefined) generic = true;
    else fields[field] = messageFor(field, texts);
  }
  return { fields, generic };
}

/**
 * POST JSON con `X-Firebase-AppCheck`. Cualquier 2xx es éxito (el endpoint
 * responde 200). 400 con `fields` → errores por campo; 401, 429, otros
 * status, red caída o fallo de App Check → error genérico.
 */
export async function submitLead(body: LandingLeadInput, options: SubmitOptions): Promise<SubmitResult> {
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const token = await options.getAppCheckToken();
    const response = await doFetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", [APP_CHECK_HEADER]: token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status >= 200 && response.status < 300) return { ok: true };
    if (response.status === 400) {
      const payload: unknown = await response.json().catch(() => undefined);
      const serverFields =
        typeof payload === "object" && payload !== null ? (payload as { fields?: unknown }).fields : undefined;
      const { fields, generic } = mapServerFields(serverFields, options.texts);
      return Object.keys(fields).length > 0 ? { ok: false, fields, ...(generic ? { generic } : {}) } : { ok: false, generic: true };
    }
    return { ok: false, generic: true };
  } catch {
    return { ok: false, generic: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Datos del formulario que el servidor resuelve y pasa a `LeadForm` (serializables). */
export interface LeadFormView {
  texts: LeadFormTexts;
  legal: Pick<LegalTexts, "version" | "privacyNotice" | "commercialConsent" | "marketingConsent">;
  phoneDefaultRegion: string;
  endpoint: string;
  appCheck: AppCheckWebConfig;
  landingSlug: string;
  tourIds: string[];
  /** Enlace `wa.me` de la pantalla de gracias (con el prefill de la campaña); sin número, ausente. */
  whatsappHref?: string;
}
