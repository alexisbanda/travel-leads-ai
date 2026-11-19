import { z } from "zod";
import {
  BigQueryLocation,
  BusinessHours,
  CountryCode,
  CurrencyCode,
  DomainName,
  duplicates,
  E164Phone,
  emptyOr,
  FirebaseProjectId,
  GcpRegion,
  HexColor,
  HttpsUrl,
  InternationalTransfer,
  Locale,
  NonEmptyText,
  SecretRef,
  Slug,
  TimeZone,
} from "./primitives.js";

/** Ciclo de vida de una instancia. */
export const InstanceStatus = z.enum(["draft", "pilot", "active", "paused"]);
export type InstanceStatus = z.infer<typeof InstanceStatus>;

/** `<destino>-<mercado>[-<sufijo>]`, ISO 3166-1 alfa-2 en minúsculas. */
export const InstanceId = z.string().regex(/^[a-z]{2}-[a-z]{2}(-[a-z0-9]+)?$/, {
  message: "id de instancia inválido: usa <destino>-<mercado>[-<sufijo>] en minúsculas",
});

export const NotifyChannel = z.enum(["whatsapp_group", "email", "slack"]);
/** `memory`: adaptador en memoria, solo para desarrollo hasta el ADR de CRM. */
export const CrmProvider = z.enum(["hubspot", "pipedrive", "memory"]);
export const WhatsappBsp = z.enum(["respond_io", "360dialog", "other"]);
export const CommissionModel = z.enum(["fee", "commission", "fee_plus_commission"]);
export const QualificationMode = z.enum(["assisted", "autonomous"]);

/** Rango de presupuesto por persona: `<N`, `N-M` o `>N`. */
export const BudgetRange = z.string().regex(/^(<[0-9]+|[0-9]+-[0-9]+|>[0-9]+)$/, {
  message: "rango de presupuesto inválido: usa <N, N-M o >N",
});

const REQUIRED_OUTSIDE_DRAFT = "obligatorio cuando status no es draft";

/**
 * Campos del lead a los que se puede mapear una pregunta personalizada del formulario
 * de Meta Lead Ads (`channels.meta.leadForm.fieldMap`, docs/specs/004-meta-lead-ads-ingesta.md).
 */
export const LeadFormField = z.enum([
  "travelMonth",
  "paxAdults",
  "paxChildren",
  "budgetRange",
  "segment",
  "notes",
  "marketingConsent",
]);
export type LeadFormField = z.infer<typeof LeadFormField>;

/**
 * Valor válido para cada campo destino. Repite `TravelMonth` y `LeadSegment` de
 * `lead.ts` porque `lead.ts` importa este módulo (un import circular rompería la
 * carga); un test comprueba que siguen coincidiendo.
 */
export const LeadFormFieldValue = {
  travelMonth: z.string().regex(/^\d{4}-\d{2}$/, { message: "mes inválido: usa AAAA-MM" }),
  paxAdults: z.number().int().min(1),
  paxChildren: z.number().int().min(0),
  budgetRange: BudgetRange,
  segment: z.enum(["adventure", "couple", "senior", "diaspora", "other"]),
  notes: z.string().trim().min(1),
  marketingConsent: z.boolean(),
} satisfies Record<LeadFormField, z.ZodTypeAny>;

/**
 * Cómo se mapea una pregunta: el nombre del campo destino (la respuesta se usa tal
 * cual) o `{ field, values }` para preguntas de opción múltiple (respuesta → valor).
 */
export const LeadFormFieldMapping = z.union([
  LeadFormField,
  z
    .object({
      field: LeadFormField,
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    })
    .strict()
    .superRefine((mapping, ctx) => {
      const schema = LeadFormFieldValue[mapping.field];
      for (const [answer, value] of Object.entries(mapping.values)) {
        if (schema.safeParse(value).success) continue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values", answer],
          message: `valor inválido para ${mapping.field}`,
        });
      }
    }),
]);
export type LeadFormFieldMapping = z.infer<typeof LeadFormFieldMapping>;

/** Mapa de preguntas personalizadas del formulario de Meta: clave de la pregunta → mapeo. */
export const LeadFormFieldMap = z.record(z.string().min(1), LeadFormFieldMapping);
export type LeadFormFieldMap = z.infer<typeof LeadFormFieldMap>;

/**
 * Forma de `InstanceConfig` sin las comprobaciones entre campos; sirve de
 * base a `ResolvedInstanceConfig`. Valida siempre con `InstanceConfig`.
 */
export const InstanceConfigObject = z
  .object({
    id: InstanceId,
    name: NonEmptyText,
    status: InstanceStatus,
    agency: z
      .object({
        slug: Slug,
        legalName: z.string(),
        country: CountryCode,
        /** Vacío u omitido: se usa la zona horaria del pack de destino. */
        timezone: emptyOr(TimeZone).optional(),
        website: emptyOr(HttpsUrl),
        /** Opcional: sin canal, la tarea `agency.notify` se omite con un aviso (spec 003). */
        notify: z
          .object({
            channel: NotifyChannel,
            target: SecretRef,
          })
          .strict()
          .optional(),
      })
      .strict(),
    partner: z
      .object({
        legalName: z.string(),
        country: CountryCode,
      })
      .strict(),
    destination: z.object({ country: CountryCode }).strict(),
    market: z
      .object({
        country: CountryCode,
        /** Opcionales: si se omiten, se usan los del pack de mercado. */
        locale: Locale.optional(),
        currency: CurrencyCode.optional(),
        timezone: TimeZone.optional(),
        phoneDefaultRegion: CountryCode.optional(),
        businessHours: BusinessHours.optional(),
      })
      .strict(),
    brand: z
      .object({
        displayName: z.string(),
        domain: emptyOr(DomainName),
        logo: z.string(),
        primaryColor: HexColor,
      })
      .strict(),
    infra: z
      .object({
        firebaseProjects: z
          .object({
            dev: FirebaseProjectId,
            prod: FirebaseProjectId,
          })
          .strict(),
        region: emptyOr(GcpRegion),
        bigqueryLocation: emptyOr(BigQueryLocation),
      })
      .strict(),
    channels: z
      .object({
        crm: z
          .object({
            provider: CrmProvider,
            tokenSecret: SecretRef,
          })
          .strict(),
        whatsapp: z
          .object({
            bsp: WhatsappBsp,
            number: emptyOr(E164Phone),
            webhookSecret: SecretRef,
          })
          .strict(),
        meta: z
          .object({
            pixelId: emptyOr(z.string().regex(/^[0-9]+$/, { message: "ID de píxel inválido" })),
            adAccountId: emptyOr(
              z
                .string()
                .regex(/^(act_)?[0-9]+$/, { message: "ID de cuenta publicitaria inválido" }),
            ),
            pageId: emptyOr(z.string().regex(/^[0-9]+$/, { message: "ID de página inválido" })),
            capiTokenSecret: SecretRef,
            /** Token de página para leer los leads de la Graph API. */
            pageTokenSecret: SecretRef,
            leadForm: z
              .object({
                fieldMap: LeadFormFieldMap.default({}),
              })
              .strict()
              .optional(),
          })
          .strict(),
        gtmId: emptyOr(z.string().regex(/^GTM-[A-Z0-9]+$/, { message: "ID de GTM inválido" })),
        ga4MeasurementId: emptyOr(
          z.string().regex(/^G-[A-Z0-9]+$/, { message: "ID de medición de GA4 inválido" }),
        ),
      })
      .strict(),
    segments: z
      .array(
        z
          .object({
            id: Slug,
            label: z.string(),
          })
          .strict(),
      )
      .min(1, { message: "indica al menos un segmento" }),
    pricing: z
      .object({
        budgetRanges: z.array(BudgetRange),
      })
      .strict(),
    sla: z
      .object({
        warnAfterMinutes: z.number().int().positive(),
        breachAfterMinutes: z.number().int().positive(),
      })
      .strict(),
    compliance: z
      .object({
        dataRetentionMonths: z.number().int().positive(),
        legalTextsVersion: z.string(),
        internationalTransfer: InternationalTransfer,
      })
      .strict(),
    commission: z
      .object({
        model: CommissionModel,
        /** Fracción entre 0 y 1 (0.1 = 10 %). */
        rate: z.number().min(0).max(1, { message: "la comisión es una fracción entre 0 y 1" }),
      })
      .strict(),
    agents: z
      .object({
        qualification: z
          .object({
            enabled: z.boolean(),
            mode: QualificationMode,
          })
          .strict(),
        proposal: z.object({ enabled: z.boolean() }).strict(),
        persona: z.object({ name: z.string() }).strict(),
      })
      .strict(),
    features: z.object({ mcpCatalog: z.boolean() }).strict(),
  })
  .strict();

/** Campos que `refineInstanceConfig` comprueba (comunes a la instancia y a la configuración resuelta). */
type RefinableInstance = Pick<
  z.infer<typeof InstanceConfigObject>,
  "status" | "segments" | "sla" | "agency" | "partner" | "channels" | "commission"
>;

/** Comprobaciones entre campos de la instancia: ids únicos, SLA coherente y obligatorios fuera de draft. */
export function refineInstanceConfig(config: RefinableInstance, ctx: z.RefinementCtx): void {
  for (const id of duplicates(config.segments.map((segment) => segment.id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segments"],
      message: `id de segmento repetido: ${id}`,
    });
  }

  if (config.sla.breachAfterMinutes <= config.sla.warnAfterMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sla", "breachAfterMinutes"],
      message: "breachAfterMinutes debe ser mayor que warnAfterMinutes",
    });
  }

  if (config.status === "draft") return;

  const required: Array<[path: (string | number)[], missing: boolean]> = [
    [["agency", "legalName"], config.agency.legalName.trim() === ""],
    [["partner", "legalName"], config.partner.legalName.trim() === ""],
    [["channels", "whatsapp", "number"], config.channels.whatsapp.number === ""],
    [["commission", "rate"], !(config.commission.rate > 0)],
  ];
  for (const [path, missing] of required) {
    if (!missing) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        path[0] === "commission"
          ? `debe ser mayor que 0: ${REQUIRED_OUTSIDE_DRAFT}`
          : REQUIRED_OUTSIDE_DRAFT,
    });
  }
}

/** Configuración de una instancia (`instances/<id>/instance.yaml`). */
export const InstanceConfig = InstanceConfigObject.superRefine(refineInstanceConfig);
export type InstanceConfig = z.infer<typeof InstanceConfig>;
