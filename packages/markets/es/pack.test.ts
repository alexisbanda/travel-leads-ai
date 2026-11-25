import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { findLockedOverrides, InstanceConfig, MarketPack } from "@tla/shared";
import { AI_DISCLOSURE_BRAND_PLACEHOLDER, getMarketPack, marketPacks } from "../index.js";
import { es } from "./pack.js";

function loadInstance(id: string): InstanceConfig {
  const file = fileURLToPath(new URL(`../../../instances/${id}/instance.yaml`, import.meta.url));
  return InstanceConfig.parse(parse(readFileSync(file, "utf8")));
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

const ecEs = loadInstance("ec-es");

describe("pack de mercado es", () => {
  it("valida contra el esquema MarketPack", () => {
    expect(MarketPack.safeParse(es).success).toBe(true);
  });

  it("define idioma, moneda, zona horaria, región telefónica, horario y régimen", () => {
    expect(es.country).toBe("ES");
    expect(es.locale).toBe("es-ES");
    expect(es.currency).toBe("EUR");
    expect(es.timezone).toBe("Europe/Madrid");
    expect(es.phoneDefaultRegion).toBe("ES");
    expect(es.businessHours.start).toBe("09:00");
    expect(es.businessHours.end).toBe("21:00");
    expect(es.legalRegime).toBe("gdpr");
  });

  it("solo permite regiones de datos europeas, incluida la de ec-es, y BigQuery en EU", () => {
    expect(es.dataRegions).toContain("europe-southwest1");
    for (const region of es.dataRegions) expect(region).toMatch(/^europe-/);
    expect(es.dataRegions).not.toContain("europe-west2"); // Londres, fuera de la UE
    expect(es.dataRegions).not.toContain("europe-west6"); // Zúrich, fuera de la UE
    expect(es.bigqueryLocation).toBe("EU");
  });

  it("bloquea regiones de datos, BigQuery y aviso de IA", () => {
    expect(es.locked).toEqual(
      expect.arrayContaining(["dataRegions", "bigqueryLocation", "aiDisclosure"]),
    );
    // La instancia necesita poder ajustar su horario.
    expect(es.locked).not.toContain("businessHours");
  });

  it("define los textos de interfaz de landings (landingUi) en es-ES", () => {
    expect(es.landingUi.aiImageLabel).toBe("Imagen generada con IA");
    expect(es.landingUi.priceFrom).toBe("Desde {price} por persona");
    expect(es.landingUi.dayLabel).toBe("Día {day}");
    expect(es.landingUi.sectionTitles).toEqual({
      itinerary: "Itinerario",
      includes: "Qué incluye",
      bestSeason: "Mejor época",
      priceGuidance: "Precio orientativo",
      faq: "Preguntas frecuentes",
      trust: "Por qué confiar en nosotros",
    });
    expect(es.landingUi.includedLabel).toBeTruthy();
    expect(es.landingUi.notIncludedLabel).toBeTruthy();
    expect(es.landingUi.trust.phoneLabel).toBe("Atención por WhatsApp");
    expect(es.landingUi.trust.agencyLabel).toBe("Agencia receptiva");
    expect(es.landingUi.whatsappCta).toBe("Escríbenos por WhatsApp");
  });

  it("define los textos del formulario de lead (landingUi.form) sin prometer precio ni reserva", () => {
    const form = es.landingUi.form;
    expect(Object.keys(form).sort()).toEqual(
      [
        "nameLabel",
        "phoneLabel",
        "emailLabel",
        "travelMonthLabel",
        "adultsLabel",
        "childrenLabel",
        "submit",
        "submitting",
        "errorRequired",
        "errorPhone",
        "errorEmail",
        "errorConsent",
        "errorGeneric",
        "thanksTitle",
        "thanksBody",
        "thanksWhatsapp",
      ].sort(),
    );
    for (const text of Object.values(form)) expect(text.trim()).not.toBe("");
    expect(form.thanksBody).toBe(
      "Hemos recibido tu solicitud. Te escribiremos en breve para preparar tu viaje.",
    );
    const all = Object.values(form).join(" ").toLowerCase();
    for (const word of ["reserva", "confirmad", "disponib", "precio"]) {
      expect(all).not.toContain(word);
    }
  });

  it("textos legales y aviso de IA en borrador y en es-ES", () => {
    expect(es.legalTexts.version).toBe("draft");
    expect(es.aiDisclosure.version).toBe("draft");
    expect(es.aiDisclosure.text.startsWith("Hola, soy un asistente de IA")).toBe(true);
    expect(es.aiDisclosure.text).toContain(AI_DISCLOSURE_BRAND_PLACEHOLDER);
    expect(es.legalTexts.marketingConsent).toBeDefined();
    expect(es.legalTexts.cookieBanner).toBeDefined();
  });

  it("incluye páginas legales en borrador, con slugs únicos", () => {
    expect(es.legalTexts.version).toBe("draft");
    const slugs = es.legalTexts.pages.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(expect.arrayContaining(["privacidad", "cookies", "aviso-legal"]));
    for (const page of es.legalTexts.pages) {
      expect(page.body).toMatch(/Borrador pendiente de revisión legal/);
    }
  });

  it("retención de 24 meses, transferencia scc y aviso de precios orientativos", () => {
    expect(es.dataRetentionMonths).toBe(24);
    expect(es.internationalTransferWithoutAdequacy).toBe("scc");
    expect(es.priceDisclaimer.trim()).not.toBe("");
    expect(es.priceDisclaimer).toMatch(/orientativo/i);
  });
});

describe("bloqueos del pack es frente a instancias", () => {
  it("ec-es respeta los bloqueos", () => {
    expect(ecEs.market.country).toBe("ES");
    expect(findLockedOverrides(es, ecEs)).toEqual([]);
  });

  it("falla si la instancia sobrescribe la ubicación de BigQuery", () => {
    const copy = InstanceConfig.parse(withValue(ecEs, "infra.bigqueryLocation", "US"));
    const result = findLockedOverrides(es, copy);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "bigqueryLocation", expected: "EU", actual: "US" });
  });

  it("falla si la instancia usa una región de datos fuera de Europa", () => {
    const copy = InstanceConfig.parse(withValue(ecEs, "infra.region", "us-central1"));
    const result = findLockedOverrides(es, copy);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "dataRegions", path: "infra.region" });
  });
});

describe("registro de packs de mercado", () => {
  it("expone es por código de país", () => {
    expect(marketPacks.ES).toBe(es);
    expect(getMarketPack("ES")).toBe(es);
  });

  it("devuelve undefined si no hay pack", () => {
    expect(getMarketPack("ZZ")).toBeUndefined();
    expect(getMarketPack("toString")).toBeUndefined();
  });

  it("cada pack del registro valida y está bajo su código de país", () => {
    for (const [country, pack] of Object.entries(marketPacks)) {
      expect(MarketPack.safeParse(pack).success).toBe(true);
      expect(pack.country).toBe(country);
    }
  });
});
