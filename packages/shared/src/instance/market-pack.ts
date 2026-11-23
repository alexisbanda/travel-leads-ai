import { z } from "zod";
import {
  BigQueryLocation,
  BusinessHours,
  CountryCode,
  CurrencyCode,
  duplicates,
  GcpRegion,
  InternationalTransfer,
  Locale,
  NonEmptyText,
  TextVersion,
  TimeZone,
} from "./primitives.js";

/**
 * Régimen de protección de datos del mercado. Enumeración genérica de
 * regímenes; añadir uno nuevo exige revisión legal del pack que lo use.
 */
export const LegalRegime = z.enum(["gdpr", "ccpa", "lgpd", "other"]);
export type LegalRegime = z.infer<typeof LegalRegime>;

/** Texto con versión, para poder probar qué versión vio el viajero. */
export const VersionedText = z
  .object({
    text: NonEmptyText,
    version: TextVersion,
  })
  .strict();
export type VersionedText = z.infer<typeof VersionedText>;

/** Página legal completa (privacidad, cookies, aviso legal...) del mercado. */
export const MarketLegalPage = z
  .object({
    /** Identificador en kebab-case; se usa como ruta `/legal/<slug>`. */
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "identificador inválido: usa kebab-case (minúsculas, dígitos y -)",
    }),
    title: NonEmptyText,
    body: NonEmptyText,
  })
  .strict();
export type MarketLegalPage = z.infer<typeof MarketLegalPage>;

/** Textos legales base del mercado, en su idioma, con una versión común. */
export const MarketLegalTexts = z
  .object({
    version: TextVersion,
    /** Información de privacidad junto al formulario y en el primer mensaje. */
    privacyNotice: NonEmptyText,
    /** Consentimiento para el contacto comercial (casilla no premarcada). */
    commercialConsent: NonEmptyText,
    /** Consentimiento separado y opcional para marketing posterior. */
    marketingConsent: NonEmptyText.optional(),
    /** Texto del banner de cookies. */
    cookieBanner: NonEmptyText.optional(),
    /** Páginas legales completas que publica la plantilla de landings en `/legal/<slug>`. */
    pages: z.array(MarketLegalPage).min(1, { message: "indica al menos una página legal" }),
  })
  .strict()
  .superRefine((legal, ctx) => {
    for (const slug of duplicates(legal.pages.map((page) => page.slug))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pages"],
        message: `slug de página legal repetido: ${slug}`,
      });
    }
  });
export type MarketLegalTexts = z.infer<typeof MarketLegalTexts>;

/** Marcador del precio formateado en `landingUi.priceFrom`. */
export const PRICE_PLACEHOLDER = "{price}";
/** Marcador del número de día en `landingUi.dayLabel`. */
export const DAY_PLACEHOLDER = "{day}";

/** Texto no vacío que debe contener el marcador `placeholder`. */
function templateText(placeholder: string) {
  return NonEmptyText.refine((text) => text.includes(placeholder), {
    message: `la plantilla debe contener el marcador ${placeholder}`,
  });
}

/**
 * Textos de interfaz de la plantilla de landings, en el idioma del mercado.
 * El motor no escribe textos para viajeros: los componentes los leen de aquí.
 */
export const MarketLandingUi = z
  .object({
    /** Etiqueta visible junto a un medio generado con IA (`aiGenerated: true`). */
    aiImageLabel: NonEmptyText,
    /** Plantilla del precio orientativo con el marcador `{price}` (precio ya formateado). */
    priceFrom: templateText(PRICE_PLACEHOLDER),
    /** Títulos de las secciones de la landing. */
    sectionTitles: z
      .object({
        itinerary: NonEmptyText,
        includes: NonEmptyText,
        bestSeason: NonEmptyText,
        priceGuidance: NonEmptyText,
        faq: NonEmptyText,
        trust: NonEmptyText,
      })
      .strict(),
    /** Plantilla de la etiqueta de cada día del itinerario, con el marcador `{day}`. */
    dayLabel: templateText(DAY_PLACEHOLDER),
    /** Encabezado de la lista de lo que incluye el viaje. */
    includedLabel: NonEmptyText,
    /** Encabezado de la lista de lo que no incluye el viaje. */
    notIncludedLabel: NonEmptyText,
    /** Etiquetas del bloque de confianza. */
    trust: z
      .object({
        /** Etiqueta del teléfono o canal de atención. */
        phoneLabel: NonEmptyText,
        /** Etiqueta de la agencia. */
        agencyLabel: NonEmptyText,
      })
      .strict(),
    /** Texto del botón de WhatsApp. */
    whatsappCta: NonEmptyText,
  })
  .strict();
export type MarketLandingUi = z.infer<typeof MarketLandingUi>;

/**
 * Claves del pack de mercado que se pueden declarar como bloqueadas: la
 * instancia no puede sobrescribirlas al resolver la configuración.
 */
export const MarketPackLockableKey = z.enum([
  "locale",
  "currency",
  "timezone",
  "phoneDefaultRegion",
  "businessHours",
  "legalRegime",
  "dataRegions",
  "bigqueryLocation",
  "dataRetentionMonths",
  "internationalTransferWithoutAdequacy",
  "aiDisclosure",
  "legalTexts",
  "priceDisclaimer",
  "agentTone",
]);
export type MarketPackLockableKey = z.infer<typeof MarketPackLockableKey>;

/** Pack de mercado (`packages/markets/<iso>`): lo que depende del país emisor. */
export const MarketPack = z
  .object({
    /** País del mercado emisor. */
    country: CountryCode,
    /** Idioma y variante de los textos para viajeros. */
    locale: Locale,
    /** Moneda en la que se muestran los precios orientativos. */
    currency: CurrencyCode,
    /** Zona horaria del mercado (horario de atención, envíos). */
    timezone: TimeZone,
    /** Región por defecto para interpretar teléfonos sin prefijo. */
    phoneDefaultRegion: CountryCode,
    /** Horario de atención por defecto, en la zona horaria del mercado. */
    businessHours: BusinessHours,
    /** Régimen de protección de datos aplicable. */
    legalRegime: LegalRegime,
    /** Regiones de Google Cloud donde pueden residir los datos de la instancia. */
    dataRegions: z
      .array(GcpRegion)
      .min(1, { message: "indica al menos una región de datos permitida" }),
    /** Ubicación de BigQuery exigida para la analítica. */
    bigqueryLocation: BigQueryLocation,
    /** Conservación por defecto de leads sin venta, en meses. */
    dataRetentionMonths: z.number().int().positive(),
    /** Mecanismo de transferencia exigido cuando el destino no tiene decisión de adecuación. */
    internationalTransferWithoutAdequacy: InternationalTransfer,
    /** Aviso de que el viajero habla con una IA (primer mensaje, perfil). */
    aiDisclosure: VersionedText,
    /** Textos legales base. */
    legalTexts: MarketLegalTexts,
    /** Aviso de que los precios son orientativos y no una oferta. */
    priceDisclaimer: NonEmptyText,
    /** Descripción del tono del agente para los prompts. */
    agentTone: NonEmptyText,
    /** Textos de interfaz de la plantilla de landings. */
    landingUi: MarketLandingUi,
    /** Claves que la instancia no puede sobrescribir. */
    locked: z.array(MarketPackLockableKey),
  })
  .strict()
  .superRefine((pack, ctx) => {
    for (const region of duplicates(pack.dataRegions)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataRegions"],
        message: `región de datos repetida: ${region}`,
      });
    }
    for (const key of duplicates(pack.locked)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locked"],
        message: `clave bloqueada repetida: ${key}`,
      });
    }
  });
export type MarketPack = z.infer<typeof MarketPack>;
