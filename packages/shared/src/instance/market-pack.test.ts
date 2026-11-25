import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { MarketPack } from "./market-pack.js";

// Utilidades de test (duplicadas en cada archivo de test para no publicarlas en el build).
/** Primer valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
function firstSupported(kind: "currency" | "timeZone"): string {
  const value = Intl.supportedValuesOf(kind)[0];
  if (value === undefined) throw new Error(`Intl no expone valores de ${kind}`);
  return value;
}

/** Copia profunda de `base` con `value` en la ruta con puntos `path`. */
function withValue<T>(base: T, path: string, value: unknown): T {
  const copy = structuredClone(base);
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) throw new Error("ruta vacía");
  let node = copy as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
  return copy;
}

/** Paths (con puntos) de todos los issues de un `safeParse`. */
function issuePaths(result: z.SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

// Pack ficticio: códigos y regiones inventados; moneda y zona horaria tomadas de Intl.
const validPack = {
  country: "YY",
  locale: "xx-YY",
  currency: firstSupported("currency"),
  timezone: firstSupported("timeZone"),
  phoneDefaultRegion: "YY",
  businessHours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6] },
  legalRegime: "gdpr",
  dataRegions: ["area-zone1", "area-zone2"],
  bigqueryLocation: "ZZ",
  dataRetentionMonths: 24,
  internationalTransferWithoutAdequacy: "scc",
  aiDisclosure: { text: "Aviso ficticio: hablas con un asistente de IA.", version: "draft" },
  legalTexts: {
    version: "draft",
    privacyNotice: "Texto ficticio de privacidad.",
    commercialConsent: "Texto ficticio de consentimiento.",
    pages: [{ slug: "privacidad", title: "Privacidad (ficticio)", body: "Texto ficticio." }],
  },
  priceDisclaimer: "Precios orientativos (texto ficticio).",
  agentTone: "Cercano (texto ficticio).",
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
  locked: ["dataRegions", "bigqueryLocation", "aiDisclosure"],
};

describe("MarketPack", () => {
  it("acepta un pack completo", () => {
    expect(issuePaths(MarketPack.safeParse(validPack))).toEqual([]);
  });

  it.each([
    ["country", "yy"],
    ["currency", "XXXX"],
    ["dataRegions", []],
    ["aiDisclosure.text", " "],
    ["legalTexts.version", ""],
    ["legalTexts.pages", []],
    ["legalTexts.pages.0.slug", "No_Kebab"],
    ["locked", ["dataRegions", "dataRegions"]],
    ["businessHours.end", "08:00"],
  ])("rechaza un %s inválido", (path, value) => {
    const result = MarketPack.safeParse(withValue(validPack, path, value));
    expect(issuePaths(result)).toEqual([path]);
  });

  it("exige el bloque landingUi", () => {
    const { landingUi: _landingUi, ...rest } = validPack;
    expect(issuePaths(MarketPack.safeParse(rest))).toContain("landingUi");
  });

  it.each([
    ["landingUi.aiImageLabel", ""],
    ["landingUi.priceFrom", "Desde 100"],
    ["landingUi.priceFrom", " "],
    ["landingUi.dayLabel", "Día"],
    ["landingUi.sectionTitles.faq", ""],
    ["landingUi.trust.agencyLabel", ""],
    ["landingUi.whatsappCta", ""],
    ["landingUi.form.submit", ""],
    ["landingUi.form.errorGeneric", " "],
    ["landingUi.form.thanksWhatsapp", ""],
  ])("rechaza %s = %j en su ruta", (path, value) => {
    const result = MarketPack.safeParse(withValue(validPack, path, value));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(path);
  });

  it("landingUi es estricto: rechaza claves desconocidas", () => {
    const result = MarketPack.safeParse(withValue(validPack, "landingUi.unknown", "x"));
    expect(issuePaths(result)).toContain("landingUi");
  });

  it("rechaza claves bloqueadas que no existen en el pack", () => {
    const result = MarketPack.safeParse(withValue(validPack, "locked", ["unknown"]));
    expect(issuePaths(result)).toEqual(["locked.0"]);
  });

  it("rechaza páginas legales con slug repetido", () => {
    const withDuplicate = withValue(validPack, "legalTexts.pages", [
      { slug: "privacidad", title: "Privacidad", body: "Texto." },
      { slug: "privacidad", title: "Otra", body: "Otro texto." },
    ]);
    const result = MarketPack.safeParse(withDuplicate);
    expect(issuePaths(result)).toEqual(["legalTexts.pages"]);
  });
});
