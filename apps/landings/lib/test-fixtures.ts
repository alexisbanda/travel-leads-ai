import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LandingContent, ResolvedInstanceConfig } from "@tla/shared";

/**
 * Fixture de configuración resuelta para los tests de `apps/landings`: una
 * copia estática (contenido ficticio, sin datos reales) de lo que produce
 * `pnpm instance:build ec-es`, con `status: "active"` y todos los campos
 * obligatorios fuera de `draft` ya completados. Los tests la clonan y
 * mutan con `withResolvedInstance`.
 */
export const BASE_RESOLVED_INSTANCE: ResolvedInstanceConfig = {
  agency: {
    country: "EC",
    legalName: "Agencia de ejemplo",
    notify: { channel: "email", target: "secret:AGENCY_NOTIFY_TARGET" },
    slug: "agencia-ec",
    timezone: "America/Guayaquil", // hardcoding-ok: valor de prueba, no leído por apps/landings
    website: "",
  },
  agents: {
    persona: { name: "" },
    proposal: { enabled: false },
    qualification: { enabled: true, mode: "assisted" },
  },
  brand: {
    displayName: "Marca de ejemplo",
    domain: "ejemplo.test",
    logo: "",
    primaryColor: "#000000",
  },
  channels: {
    crm: { provider: "hubspot", tokenSecret: "secret:CRM_API_TOKEN" },
    email: { from: "ejemplo@ejemplo.test", smtpSecret: "secret:SMTP_CONNECTION_URI" },
    ga4MeasurementId: "",
    gtmId: "",
    meta: {
      adAccountId: "",
      capiTokenSecret: "secret:META_CAPI_ACCESS_TOKEN",
      leadForm: { fieldMap: {} },
      pageId: "",
      pageTokenSecret: "secret:META_PAGE_ACCESS_TOKEN",
      pixelId: "",
    },
    whatsapp: {
      bsp: "respond_io",
      number: "+34600000000", // hardcoding-ok: número ficticio de pruebas
      webhookSecret: "secret:WHATSAPP_BSP_WEBHOOK_SECRET",
    },
    web: {
      firebaseApiKey: "AIzaFAKE-test-api-key",
      firebaseAppId: "1:123456789:web:abc123",
      recaptchaSiteKey: "fake-recaptcha-site-key-0000",
    },
  },
  commission: { model: "fee_plus_commission", rate: 0.1 },
  compliance: { dataRetentionMonths: 24, internationalTransfer: "scc", legalTextsVersion: "" },
  destination: { country: "EC" },
  destinationPack: {
    country: "EC",
    currency: "USD", // hardcoding-ok: valor de prueba, no leído por apps/landings
    markets: {
      ES: {
        adequacyDecision: false,
        entryRequirements: [{ label: "Fuente de ejemplo", url: "https://ejemplo.test" }],
        travelAdvice: [{ label: "Fuente de ejemplo", url: "https://ejemplo.test" }],
      },
    },
    regions: [{ id: "galapagos", label: "Galápagos" }], // hardcoding-ok: valor de prueba, no leído por apps/landings
    seasons: [],
    timezone: "America/Guayaquil", // hardcoding-ok: valor de prueba, no leído por apps/landings
  },
  features: { mcpCatalog: false },
  id: "ec-es",
  infra: {
    bigqueryLocation: "EU",
    firebaseProjects: { dev: "tla-ec-es-dev", prod: "tla-ec-es-prod" },
    region: "europe-southwest1", // hardcoding-ok: valor de prueba, no leído por apps/landings
  },
  market: {
    businessHours: { days: [1, 2, 3, 4, 5, 6], end: "21:00", start: "09:00" },
    country: "ES",
    currency: "EUR", // hardcoding-ok: valor de prueba, no leído por apps/landings
    locale: "es-ES", // hardcoding-ok: valor de prueba, no leído por apps/landings
    phoneDefaultRegion: "ES",
    timezone: "Europe/Madrid", // hardcoding-ok: valor de prueba, no leído por apps/landings
  },
  marketPack: {
    agentTone: "Tono de ejemplo.",
    landingUi: {
      aiImageLabel: "Etiqueta IA (ficticio)",
      priceFrom: "Desde {price} (ficticio)",
      sectionTitles: {
        itinerary: "Itinerario (ficticio)",
        includes: "Incluye (ficticio)",
        bestSeason: "Época (ficticio)",
        priceGuidance: "Precio (ficticio)",
        faq: "FAQ (ficticio)",
        trust: "Confianza (ficticio)",
      },
      dayLabel: "Día {day} (ficticio)",
      includedLabel: "Incluido (ficticio)",
      notIncludedLabel: "No incluido (ficticio)",
      trust: { phoneLabel: "Teléfono (ficticio)", agencyLabel: "Agencia (ficticio)" },
      whatsappCta: "WhatsApp (ficticio)",
      form: {
        nameLabel: "nameLabel (ficticio)",
        phoneLabel: "phoneLabel (ficticio)",
        emailLabel: "emailLabel (ficticio)",
        travelMonthLabel: "travelMonthLabel (ficticio)",
        adultsLabel: "adultsLabel (ficticio)",
        childrenLabel: "childrenLabel (ficticio)",
        submit: "submit (ficticio)",
        submitting: "submitting (ficticio)",
        errorRequired: "errorRequired (ficticio)",
        errorPhone: "errorPhone (ficticio)",
        errorEmail: "errorEmail (ficticio)",
        errorConsent: "errorConsent (ficticio)",
        errorGeneric: "errorGeneric (ficticio)",
        thanksTitle: "thanksTitle (ficticio)",
        thanksBody: "thanksBody (ficticio)",
        thanksWhatsapp: "thanksWhatsapp (ficticio)",
      },
    },
    aiDisclosure: { text: "Aviso de IA de ejemplo.", version: "draft" },
    bigqueryLocation: "EU",
    businessHours: { days: [1, 2, 3, 4, 5, 6], end: "21:00", start: "09:00" },
    country: "ES",
    currency: "EUR", // hardcoding-ok: valor de prueba, no leído por apps/landings
    dataRegions: ["europe-southwest1"], // hardcoding-ok: valor de prueba, no leído por apps/landings
    dataRetentionMonths: 24,
    internationalTransferWithoutAdequacy: "scc",
    legalRegime: "gdpr",
    legalTexts: {
      commercialConsent: "Consentimiento comercial de ejemplo.",
      cookieBanner: "Aviso de cookies de ejemplo.",
      marketingConsent: "Consentimiento de marketing de ejemplo.",
      pages: [
        { body: "Cuerpo de ejemplo.", slug: "privacidad", title: "Política de privacidad" },
        { body: "Cuerpo de ejemplo.", slug: "cookies", title: "Política de cookies" },
        { body: "Cuerpo de ejemplo.", slug: "aviso-legal", title: "Aviso legal" },
      ],
      privacyNotice: "Aviso de privacidad de ejemplo.",
      version: "draft",
    },
    locale: "es-ES", // hardcoding-ok: valor de prueba, no leído por apps/landings
    locked: [
      "legalRegime",
      "dataRegions",
      "bigqueryLocation",
      "internationalTransferWithoutAdequacy",
      "aiDisclosure",
      "legalTexts",
      "priceDisclaimer",
    ],
    phoneDefaultRegion: "ES",
    priceDisclaimer: "Precio orientativo de ejemplo.",
    timezone: "Europe/Madrid", // hardcoding-ok: valor de prueba, no leído por apps/landings
  },
  name: "Instancia de ejemplo",
  partner: { country: "ES", legalName: "Socio de ejemplo" },
  pricing: { budgetRanges: ["<2000", "2000-4000", "4000-6000", ">6000"] },
  segments: [{ id: "adventure", label: "Aventura y naturaleza" }],
  sla: { breachAfterMinutes: 30, warnAfterMinutes: 10 },
  status: "active",
};

/** Copia profunda de `BASE_RESOLVED_INSTANCE`, mutada por `mutate` (p. ej. para vaciar un campo). */
export function withResolvedInstance(
  mutate: (clone: ResolvedInstanceConfig) => void,
): ResolvedInstanceConfig {
  const clone = structuredClone(BASE_RESOLVED_INSTANCE);
  mutate(clone);
  return clone;
}

/** Crea un directorio temporal con `instance.json` dentro, listo para `resolvedPath`. */
export function writeResolvedInstanceFile(instance: ResolvedInstanceConfig): {
  dir: string;
  path: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "landings-config-"));
  const path = join(dir, "instance.json");
  writeFileSync(path, JSON.stringify(instance));
  return { dir, path };
}

/** Contenido de landing ficticio, válido por defecto (sin `draft`). */
export function buildLanding(overrides: Partial<LandingContent> = {}): LandingContent {
  return {
    slug: "ejemplo",
    segment: "adventure",
    tourIds: ["tour-ejemplo"],
    seo: { title: "Título de ejemplo", description: "Descripción de ejemplo." },
    hero: { headline: "Titular de ejemplo" },
    sections: ["faq", "cta"],
    cta: { type: "whatsapp" },
    draft: false,
    ...overrides,
  };
}

/** Crea `<dir>/content/landings/<slug>.json` con el contenido dado (ya serializado como JSON). */
export function writeLandingFile(landingsDir: string, slug: string, json: unknown): void {
  mkdirSync(landingsDir, { recursive: true });
  writeFileSync(join(landingsDir, `${slug}.json`), JSON.stringify(json));
}

/** Crea un directorio temporal `content/landings` vacío, listo para usar como `dir`. */
export function mkLandingsDir(): string {
  const base = mkdtempSync(join(tmpdir(), "landings-content-"));
  return join(base, "content", "landings");
}

/**
 * Landing ficticia con todas las secciones y datos (vídeo en el hero,
 * itinerario, incluye, época, precio orientativo, FAQ, confianza y CTA).
 */
export function buildFullLanding(overrides: Partial<LandingContent> = {}): LandingContent {
  return buildLanding({
    hero: {
      headline: "Titular de ejemplo",
      subheadline: "Subtítulo de ejemplo",
      media: {
        src: "/media/ejemplo.mp4",
        kind: "video",
        poster: "/media/ejemplo.jpg",
        alt: "Texto alternativo de ejemplo",
        aiGenerated: false,
      },
    },
    sections: ["itinerary", "includes", "bestSeason", "priceGuidance", "faq", "trust", "cta"],
    itinerary: [
      { day: 1, title: "Primer día de ejemplo", description: "Descripción del primer día." },
      { day: 2, title: "Segundo día de ejemplo", description: "Descripción del segundo día." },
    ],
    includes: { included: ["Elemento incluido de ejemplo"], notIncluded: ["Elemento no incluido de ejemplo"] },
    bestSeason: { summary: "Resumen de época de ejemplo." },
    priceGuidance: { from: 2490 },
    faq: [{ q: "Pregunta de ejemplo", a: "Respuesta de ejemplo." }],
    cta: { type: "whatsapp", prefill: "Mensaje de ejemplo [EJ-01]" },
    ...overrides,
  });
}
