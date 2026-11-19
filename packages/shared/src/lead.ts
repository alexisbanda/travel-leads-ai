import { z } from "zod";
import { BudgetRange } from "./instance/instance-config.js";
import {
  CountryCode,
  CurrencyCode,
  E164Phone,
  Locale,
  NonEmptyText,
  TextVersion,
} from "./instance/primitives.js";

/**
 * Esquemas del registro de leads (ver docs/02-modelo-de-datos.md).
 *
 * Los documentos persistidos (`Lead`, `Consent`, `LeadEvent`, `Sale`) usan
 * `Date` para las marcas de tiempo: la conversión desde y hacia los
 * `Timestamp` de Firestore se hace en `functions/`, no aquí.
 */

/**
 * Máquina de estados del lead (ver docs/02-modelo-de-datos.md).
 *
 * new -> contacted -> qualified -> handed_off -> quoted -> won | lost
 * new -> invalid
 * contacted -> unresponsive (sin respuesta 7 días)
 * unresponsive -> contacted (retoma)
 */
export const LeadStatus = z.enum([
  "new",
  "contacted",
  "unresponsive",
  "qualified",
  "handed_off",
  "quoted",
  "won",
  "lost",
  "invalid",
]);

export type LeadStatus = z.infer<typeof LeadStatus>;

/** Canal por el que entra el lead. */
export const LeadSource = z.enum(["landing", "meta_lead_ad", "whatsapp", "manual"]);
export type LeadSource = z.infer<typeof LeadSource>;

/** Segmento del viajero. */
export const LeadSegment = z.enum(["adventure", "couple", "senior", "diaspora", "other"]);
export type LeadSegment = z.infer<typeof LeadSegment>;

/** ULID (Crockford base32, 26 caracteres). */
export const Ulid = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/, {
  message: "ULID inválido",
});
export type Ulid = z.infer<typeof Ulid>;

/** Hash SHA-256 en hexadecimal en minúsculas. */
export const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, {
  message: "hash SHA-256 inválido: 64 caracteres hexadecimales en minúsculas",
});
export type Sha256Hex = z.infer<typeof Sha256Hex>;

/** Mes de viaje `AAAA-MM`. */
export const TravelMonth = z.string().regex(/^\d{4}-\d{2}$/, {
  message: "mes inválido: usa AAAA-MM",
});
export type TravelMonth = z.infer<typeof TravelMonth>;

/** Número de viajeros. */
export const Pax = z.object({
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
});
export type Pax = z.infer<typeof Pax>;

/** Datos de contacto normalizados. Debe haber teléfono o email (base del `dedupeKey`). */
export const Contact = z
  .object({
    name: NonEmptyText,
    phoneE164: E164Phone.optional(),
    email: z.string().email().optional(),
    country: CountryCode,
    language: Locale,
  })
  .refine((contact) => contact.phoneE164 !== undefined || contact.email !== undefined, {
    message: "el contacto necesita teléfono o email",
    path: ["phoneE164"],
  });
export type Contact = z.infer<typeof Contact>;

/** Interés del viajero. */
export const Interest = z.object({
  tourIds: z.array(z.string().min(1)),
  travelMonth: TravelMonth.optional(),
  flexibleDates: z.boolean().optional(),
  pax: Pax.optional(),
  budgetRange: BudgetRange.optional(),
  notes: z.string().optional(),
});
export type Interest = z.infer<typeof Interest>;

const attributionText = z.string().max(500);

/** Atribución que envía la landing. Todo es opcional. */
export const AttributionInput = z.object({
  utmSource: attributionText.optional(),
  utmMedium: attributionText.optional(),
  utmCampaign: attributionText.optional(),
  utmContent: attributionText.optional(),
  utmTerm: attributionText.optional(),
  fbclid: attributionText.optional(),
  fbc: attributionText.optional(),
  fbp: attributionText.optional(),
  gclid: attributionText.optional(),
  eventId: attributionText.optional(),
});
export type AttributionInput = z.infer<typeof AttributionInput>;

/** Atribución persistida en el lead. Todo es opcional. */
export const Attribution = AttributionInput.extend({
  ctwaClid: attributionText.optional(),
  landingSlug: z.string().optional(),
  metaAdId: z.string().optional(),
  metaAdsetId: z.string().optional(),
  metaCampaignId: z.string().optional(),
  firstTouchAt: z.date().optional(),
});
export type Attribution = z.infer<typeof Attribution>;

/** Documento `leads/{leadId}`. */
export const Lead = z.object({
  leadId: Ulid,
  dedupeKey: Sha256Hex,
  source: LeadSource,
  status: LeadStatus,
  contact: Contact,
  segment: LeadSegment.optional(),
  interest: Interest,
  attribution: Attribution,
  consentId: z.string().min(1),
  assignedTo: z.string().optional(),
  crm: z
    .object({
      contactId: z.string().optional(),
      dealId: z.string().optional(),
    })
    .optional(),
  sla: z
    .object({
      firstResponseAt: z.date().optional(),
      breachedAt: z.date().optional(),
    })
    .optional(),
  qualification: z
    .object({
      score: z.number().min(0).max(100).optional(),
      summary: z.string().optional(),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  retentionUntil: z.date(),
});
export type Lead = z.infer<typeof Lead>;

/**
 * Acciones que se ejecutan como tareas independientes tras crear un lead
 * (docs/specs/003-on-lead-created.md).
 */
export const LeadTaskAction = z.enum(["crm.upsert", "agency.notify", "meta.capi.lead"]);
export type LeadTaskAction = z.infer<typeof LeadTaskAction>;

/** Resultado de una ejecución de tarea. */
export const LeadTaskOutcome = z.enum(["succeeded", "failed", "skipped"]);
export type LeadTaskOutcome = z.infer<typeof LeadTaskOutcome>;

/** Tipo de evento de una tarea: `<acción>.<resultado>`. */
export type LeadTaskEventType = `${LeadTaskAction}.${LeadTaskOutcome}`;

/** Los 9 tipos `<acción>.<resultado>`, en el orden de las dos listas. */
export const LEAD_TASK_EVENT_TYPES: readonly LeadTaskEventType[] = LeadTaskAction.options.flatMap(
  (action) => LeadTaskOutcome.options.map((outcome): LeadTaskEventType => `${action}.${outcome}`),
);

/**
 * Tipos de evento de `leads/{leadId}/events` (lista cerrada, docs/02-modelo-de-datos.md):
 * - `created`: alta del lead.
 * - `reengaged`: la misma persona vuelve a escribir con el lead aún abierto (doc 03).
 * - `status_changed`: transición de la máquina de estados (lleva `from` y `to`).
 * - `<acción>.<resultado>`: ejecución de una tarea tras el alta (spec 003).
 */
export const LeadEventType = z.enum([
  "created",
  "reengaged",
  "status_changed",
  ...LEAD_TASK_EVENT_TYPES,
] as const);
export type LeadEventType = z.infer<typeof LeadEventType>;

/**
 * Código corto y sin datos personales que acompaña a un evento: motivo de un
 * `skipped` (`not_implemented`, `no_channel`) o nombre del error de un `failed`.
 */
export const LeadEventDetail = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, { message: "detail inválido: solo letras, dígitos, _, . y -" });
export type LeadEventDetail = z.infer<typeof LeadEventDetail>;

/**
 * Evento inmutable de `leads/{leadId}/events`. `from` y `to` solo aparecen en
 * las transiciones de estado; eventos como `created` o `reengaged` pueden omitirlos.
 * `attribution` guarda la atribución del nuevo envío en `reengaged`: la del lead
 * (primer contacto) no se modifica. `detail` solo lo usan los eventos de tareas.
 */
export const LeadEvent = z.object({
  type: LeadEventType,
  from: LeadStatus.optional(),
  to: LeadStatus.optional(),
  actor: NonEmptyText,
  at: z.date(),
  attribution: Attribution.optional(),
  detail: LeadEventDetail.optional(),
});
export type LeadEvent = z.infer<typeof LeadEvent>;

/** Finalidades del consentimiento. `contact` es obligatoria. */
export const ConsentPurpose = z.enum(["contact", "marketing"]);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

/** Canal en el que se otorgó el consentimiento. */
export const ConsentChannel = z.enum(["landing", "meta_form", "whatsapp"]);
export type ConsentChannel = z.infer<typeof ConsentChannel>;

/** Documento `consents/{consentId}`: registro probatorio del consentimiento. */
export const Consent = z.object({
  leadId: Ulid,
  purposes: z
    .array(ConsentPurpose)
    .refine((purposes) => purposes.includes("contact"), {
      message: "la finalidad contact es obligatoria",
    })
    .refine((purposes) => new Set(purposes).size === purposes.length, {
      message: "finalidades duplicadas",
    }),
  textVersion: TextVersion,
  channel: ConsentChannel,
  grantedAt: z.date(),
  ipHash: Sha256Hex.optional(),
  userAgent: z.string().optional(),
  withdrawnAt: z.date().optional(),
});
export type Consent = z.infer<typeof Consent>;

/** Estado del cobro de la comisión. */
export const CommissionStatus = z.enum(["pending", "invoiced", "paid"]);
export type CommissionStatus = z.infer<typeof CommissionStatus>;

/** Documento `sales/{saleId}`. */
export const Sale = z.object({
  leadId: Ulid,
  tourIds: z.array(z.string().min(1)),
  amount: z.number().nonnegative(),
  currency: CurrencyCode,
  pax: Pax,
  travelDate: z.date(),
  closedAt: z.date(),
  commission: z.object({
    rate: z.number().min(0).max(1),
    amount: z.number().nonnegative(),
    status: CommissionStatus,
  }),
  crmDealId: z.string().optional(),
  metaOfflineSentAt: z.date().optional(),
});
export type Sale = z.infer<typeof Sale>;

/** Cuerpo del formulario de la landing (spec 001). DTO plano, distinto de `Lead`. */
export const LandingLeadInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  travelMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  pax: z
    .object({
      adults: z.number().int().min(1).max(20),
      children: z.number().int().min(0).max(10),
    })
    .optional(),
  tourIds: z.array(z.string()).max(5).default([]),
  landingSlug: z.string(),
  attribution: AttributionInput.default({}),
  consent: z.object({
    contact: z.literal(true),
    marketing: z.boolean().default(false),
    textVersion: z.string(),
  }),
  website: z.string().max(0).optional(), // honeypot: debe venir vacío
});
export type LandingLeadInput = z.infer<typeof LandingLeadInput>;
