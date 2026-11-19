import {
  Consent,
  Lead,
  LeadFormFieldValue,
  LeadSegment,
  TextVersion,
  TravelMonth,
  type Attribution,
  type ConsentPurpose,
  type Interest,
  type LeadEvent,
  type LeadFormField,
  type LeadFormFieldMap,
} from "@tla/shared";
import { normalizeEmail, normalizeFreeText, normalizeName, normalizePhone } from "./contact.js";
import { dedupeKey } from "./dedupe-key.js";
import { addMonthsUtc, INGEST_ACTOR, phoneCountry, type NewLeadDocs } from "./landing-lead.js";

/**
 * Mapeo de un lead de Meta Lead Ads (respuesta de la Graph API) a los documentos de
 * la ingesta (docs/specs/004-meta-lead-ads-ingesta.md).
 *
 * Lógica pura: sin Firebase ni SDKs. Los valores por mercado (región telefónica, país,
 * idioma, retención, versión de los textos legales y mapa de preguntas) llegan como
 * parámetros desde la configuración resuelta de la instancia.
 */

/** Lead tal como lo devuelve la Graph API (`GET /<leadgen_id>?fields=…`). */
export interface MetaGraphLead {
  createdTime?: string;
  adId?: string;
  adsetId?: string;
  campaignId?: string;
  formId?: string;
  fieldData: { name: string; values: string[] }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Campo de texto opcional: ausente → `undefined`; presente y no texto → inválido. */
function optionalText(
  record: Record<string, unknown>,
  key: string,
): { ok: true; value?: string } | { ok: false } {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") return { ok: false };
  return value === "" ? { ok: true } : { ok: true, value };
}

/** Valida la forma de la respuesta de la Graph API. `undefined` si no la cumple. */
export function parseMetaGraphLead(raw: unknown): MetaGraphLead | undefined {
  if (!isRecord(raw)) return undefined;
  const lead: MetaGraphLead = { fieldData: [] };
  const keys = [
    ["created_time", "createdTime"],
    ["ad_id", "adId"],
    ["adset_id", "adsetId"],
    ["campaign_id", "campaignId"],
    ["form_id", "formId"],
  ] as const;
  for (const [source, target] of keys) {
    const text = optionalText(raw, source);
    if (!text.ok) return undefined;
    if (text.value !== undefined) lead[target] = text.value;
  }
  const fieldData = raw.field_data ?? [];
  if (!Array.isArray(fieldData)) return undefined;
  for (const item of fieldData) {
    if (!isRecord(item) || typeof item.name !== "string") return undefined;
    const values = item.values ?? [];
    if (!Array.isArray(values) || !values.every((v): v is string => typeof v === "string")) {
      return undefined;
    }
    lead.fieldData.push({ name: item.name, values });
  }
  return lead;
}

/** Valor de un campo destino ya validado. */
type FieldValue = string | number | boolean;

/** Convierte la respuesta textual de la forma corta del mapa al tipo del destino. */
function coerceAnswer(field: LeadFormField, answer: string): FieldValue | undefined {
  const text = answer.trim();
  switch (field) {
    case "paxAdults":
    case "paxChildren":
      return /^[0-9]+$/.test(text) ? Number(text) : undefined;
    case "marketingConsent": {
      const lower = text.toLowerCase();
      if (lower === "true") return true;
      if (lower === "false") return false;
      return undefined;
    }
    case "notes":
      return normalizeFreeText(text);
    default:
      return text;
  }
}

/** ¿El valor vale para el campo destino? Mismos esquemas que el lead. */
function isValidFor(field: LeadFormField, value: FieldValue): boolean {
  switch (field) {
    case "travelMonth":
      return TravelMonth.safeParse(value).success;
    case "segment":
      return LeadSegment.safeParse(value).success;
    default:
      return LeadFormFieldValue[field].safeParse(value).success;
  }
}

/** Respuesta de una pregunta: la primera opción; en `notes`, todas. */
function answerOf(field: LeadFormField, values: string[]): string | undefined {
  const answers = values.map((v) => v.trim()).filter((v) => v !== "");
  if (answers.length === 0) return undefined;
  return field === "notes" ? answers.join(", ") : answers[0];
}

/** Campos destino resueltos a partir de las preguntas personalizadas. */
export interface MappedLeadFormFields {
  travelMonth?: string;
  paxAdults?: number;
  paxChildren?: number;
  budgetRange?: string;
  segment?: LeadSegment;
  notes?: string;
  marketingConsent?: boolean;
}

/**
 * Aplica `fieldMap` a las preguntas del formulario. Una respuesta que no valida contra
 * su destino (o que repite un destino ya resuelto) se descarta y se devuelve su clave,
 * nunca su valor. Las preguntas sin mapeo se ignoran.
 */
export function mapLeadFormFields(
  fieldData: MetaGraphLead["fieldData"],
  fieldMap: LeadFormFieldMap,
): { fields: MappedLeadFormFields; discardedKeys: string[] } {
  const values: Partial<Record<LeadFormField, FieldValue>> = {};
  const notes: string[] = [];
  const discardedKeys: string[] = [];
  for (const { name, values: answers } of fieldData) {
    if (!Object.hasOwn(fieldMap, name)) continue;
    const mapping = fieldMap[name];
    if (mapping === undefined) continue;
    const field = typeof mapping === "string" ? mapping : mapping.field;
    const answer = answerOf(field, answers);
    let value: FieldValue | undefined;
    if (answer !== undefined) {
      if (typeof mapping === "string") {
        value = coerceAnswer(field, answer);
      } else if (Object.hasOwn(mapping.values, answer)) {
        value = mapping.values[answer];
      }
    }
    if (value === undefined || !isValidFor(field, value)) {
      discardedKeys.push(name);
      continue;
    }
    if (field === "notes") {
      notes.push(String(value));
      continue;
    }
    if (values[field] !== undefined) {
      discardedKeys.push(name);
      continue;
    }
    values[field] = value;
  }
  const fields: MappedLeadFormFields = {
    ...(typeof values.travelMonth === "string" && { travelMonth: values.travelMonth }),
    ...(typeof values.paxAdults === "number" && { paxAdults: values.paxAdults }),
    ...(typeof values.paxChildren === "number" && { paxChildren: values.paxChildren }),
    ...(typeof values.budgetRange === "string" && { budgetRange: values.budgetRange }),
    ...(typeof values.segment === "string" && { segment: values.segment as LeadSegment }),
    ...(notes.length > 0 && { notes: normalizeFreeText(notes.join("\n")) }),
    ...(typeof values.marketingConsent === "boolean" && {
      marketingConsent: values.marketingConsent,
    }),
  };
  return { fields, discardedKeys };
}

/** Valores de la instancia que usa el mapeo (salen de la configuración resuelta). */
export interface MetaLeadSettings {
  /** `market.phoneDefaultRegion`. */
  phoneDefaultRegion: string;
  /** `market.country`: país por defecto del contacto. */
  marketCountry: string;
  /** `market.locale`. */
  locale: string;
  /** `compliance.dataRetentionMonths`. */
  dataRetentionMonths: number;
  /** `compliance.legalTextsVersion`: versión de los textos del formulario. */
  legalTextsVersion: string;
  /** `channels.meta.leadForm.fieldMap` (`{}` si no hay). */
  fieldMap: LeadFormFieldMap;
}

export interface MetaLeadContext {
  ids: { leadId: string; consentId: string; eventId: string; reengagedEventId: string };
  now: Date;
  settings: MetaLeadSettings;
}

/** Lo que necesita la transacción de ingesta (`runIngestTransaction`). */
export interface MetaLeadIngest {
  dedupeKey: string;
  newLead: NewLeadDocs;
  reengaged: { eventId: string; event: LeadEvent };
}

export type MetaLeadError =
  "graph_api_invalid_response" | "invalid_lead_data" | "invalid_text_version";

export type BuildMetaLeadResult =
  | { ok: true; ingest: MetaLeadIngest; discardedKeys: string[] }
  | { ok: false; error: MetaLeadError; discardedKeys: string[] };

/** Campos estándar del formulario de Lead Ads. */
const STANDARD = {
  fullName: "full_name",
  firstName: "first_name",
  lastName: "last_name",
  phone: "phone_number",
  email: "email",
} as const;

function firstValue(lead: MetaGraphLead, name: string): string | undefined {
  const field = lead.fieldData.find((item) => item.name === name);
  const value = field?.values.map((v) => v.trim()).find((v) => v !== "");
  return value;
}

/** `created_time` de la Graph API (`2030-01-15T10:00:00+0000`) como fecha. */
export function parseMetaTime(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const iso = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Atribución de una entrega de Meta: campaña, conjunto y anuncio (si los hay). */
export function metaAttribution(lead: MetaGraphLead): Attribution {
  return {
    ...(lead.campaignId !== undefined && { metaCampaignId: lead.campaignId }),
    ...(lead.adsetId !== undefined && { metaAdsetId: lead.adsetId }),
    ...(lead.adId !== undefined && { metaAdId: lead.adId }),
  };
}

/**
 * Construye lead, consentimiento (`meta_form`), entrada de `dedupe`, evento `created` y
 * evento `reengaged` a partir de la respuesta de la Graph API. Sin teléfono ni email
 * válidos, o sin nombre, devuelve `invalid_lead_data` (no se crea nada). No deja campos
 * `undefined` (Firestore los rechaza).
 */
export function buildMetaLeadIngest(raw: unknown, ctx: MetaLeadContext): BuildMetaLeadResult {
  const { settings, now } = ctx;
  if (!TextVersion.safeParse(settings.legalTextsVersion).success) {
    return { ok: false, error: "invalid_text_version", discardedKeys: [] };
  }
  const graphLead = parseMetaGraphLead(raw);
  if (graphLead === undefined) {
    return { ok: false, error: "graph_api_invalid_response", discardedKeys: [] };
  }

  const { fields, discardedKeys } = mapLeadFormFields(graphLead.fieldData, settings.fieldMap);

  const fullName =
    firstValue(graphLead, STANDARD.fullName) ??
    [firstValue(graphLead, STANDARD.firstName), firstValue(graphLead, STANDARD.lastName)]
      .filter((part) => part !== undefined)
      .join(" ");
  const name = normalizeName(fullName);

  const rawPhone = firstValue(graphLead, STANDARD.phone);
  let phoneE164: string | undefined;
  if (rawPhone !== undefined) {
    const phone = normalizePhone(rawPhone, settings.phoneDefaultRegion);
    if (phone.ok) phoneE164 = phone.value;
    else discardedKeys.push(STANDARD.phone);
  }
  const rawEmail = firstValue(graphLead, STANDARD.email);
  let email: string | undefined;
  if (rawEmail !== undefined) {
    const normalized = normalizeEmail(rawEmail);
    if (Lead.shape.contact.innerType().shape.email.safeParse(normalized).success) {
      email = normalized;
    } else {
      discardedKeys.push(STANDARD.email);
    }
  }
  if (name === "" || (phoneE164 === undefined && email === undefined)) {
    return { ok: false, error: "invalid_lead_data", discardedKeys };
  }

  const { leadId, consentId, eventId, reengagedEventId } = ctx.ids;
  const key = dedupeKey({ phoneE164, email });
  const attribution = metaAttribution(graphLead);
  const interest: Interest = {
    tourIds: [],
    ...(fields.travelMonth !== undefined && { travelMonth: fields.travelMonth }),
    ...(fields.paxAdults !== undefined && {
      pax: { adults: fields.paxAdults, children: fields.paxChildren ?? 0 },
    }),
    ...(fields.budgetRange !== undefined && { budgetRange: fields.budgetRange }),
    ...(fields.notes !== undefined && { notes: fields.notes }),
  };
  if (fields.paxChildren !== undefined && fields.paxAdults === undefined) {
    const childrenKey = Object.keys(settings.fieldMap).find((question) => {
      const mapping = settings.fieldMap[question];
      return (typeof mapping === "string" ? mapping : mapping?.field) === "paxChildren";
    });
    if (childrenKey !== undefined) discardedKeys.push(childrenKey);
  }

  const lead: Lead = {
    leadId,
    dedupeKey: key,
    source: "meta_lead_ad",
    status: "new",
    contact: {
      name,
      ...(phoneE164 !== undefined && { phoneE164 }),
      ...(email !== undefined && { email }),
      country:
        phoneE164 !== undefined
          ? phoneCountry(phoneE164, settings.marketCountry)
          : settings.marketCountry,
      language: settings.locale,
    },
    ...(fields.segment !== undefined && { segment: fields.segment }),
    interest,
    attribution: { ...attribution, firstTouchAt: parseMetaTime(graphLead.createdTime) ?? now },
    consentId,
    createdAt: now,
    updatedAt: now,
    retentionUntil: addMonthsUtc(now, settings.dataRetentionMonths),
  };
  const purposes: ConsentPurpose[] =
    fields.marketingConsent === true ? ["contact", "marketing"] : ["contact"];
  const consent: Consent = {
    leadId,
    purposes,
    textVersion: settings.legalTextsVersion,
    channel: "meta_form",
    grantedAt: now,
  };
  // Defensa final: lo que se escribe cumple los esquemas del modelo de datos.
  if (!Lead.safeParse(lead).success || !Consent.safeParse(consent).success) {
    return { ok: false, error: "invalid_lead_data", discardedKeys };
  }

  return {
    ok: true,
    discardedKeys,
    ingest: {
      dedupeKey: key,
      newLead: {
        leadId,
        lead,
        consentId,
        consent,
        dedupe: { leadId, createdAt: now },
        eventId,
        event: { type: "created", actor: INGEST_ACTOR, at: now },
      },
      reengaged: {
        eventId: reengagedEventId,
        event: { type: "reengaged", actor: INGEST_ACTOR, at: now, attribution },
      },
    },
  };
}
