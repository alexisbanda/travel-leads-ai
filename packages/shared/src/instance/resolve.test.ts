import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildConfigDocs, ConfigAgents, ConfigFlags, ConfigSla } from "./config-docs.js";
import { DestinationPack } from "./destination-pack.js";
import { InstanceConfig } from "./instance-config.js";
import { MarketPack } from "./market-pack.js";
import { BRAND_PLACEHOLDER, brandName, resolveInstance } from "./resolve.js";
import { parseResolvedInstance, readResolvedInstance, ResolvedInstanceConfig } from "./resolved.js";
import type { InstancePacks } from "./rules.js";

// Utilidades de test (duplicadas en cada archivo de test para no publicarlas en el build).
/** Valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
function supported(kind: "currency" | "timeZone", index: number): string {
  const value = Intl.supportedValuesOf(kind)[index];
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

function loadInstanceYaml(id: string): unknown {
  const file = fileURLToPath(new URL(`../../../../instances/${id}/instance.yaml`, import.meta.url));
  return parse(readFileSync(file, "utf8"));
}

// Packs ficticios: ningún valor corresponde a un mercado o destino real.
const market = MarketPack.parse({
  country: "YY",
  locale: "zz-YY",
  currency: supported("currency", 0),
  timezone: supported("timeZone", 0),
  phoneDefaultRegion: "YY",
  businessHours: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
  legalRegime: "gdpr",
  dataRegions: ["zz-north1", "zz-south2"],
  bigqueryLocation: "ZZ",
  dataRetentionMonths: 24,
  internationalTransferWithoutAdequacy: "scc",
  aiDisclosure: { text: `Asistente de IA de ${BRAND_PLACEHOLDER}.`, version: "1.0.0" },
  legalTexts: {
    version: "1.0.0",
    privacyNotice: `${BRAND_PLACEHOLDER} trata tus datos.`,
    commercialConsent: "Contacto",
    pages: [{ slug: "privacidad", title: "Privacidad", body: "Texto de prueba." }],
  },
  priceDisclaimer: "Precio de prueba",
  agentTone: "Tono de prueba",
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
  locked: ["dataRegions", "bigqueryLocation", "dataRetentionMonths", "currency"],
});

const marketInfo = {
  entryRequirements: [{ label: "Requisitos", url: "https://example.test/entry" }],
  travelAdvice: [{ label: "Avisos", url: "https://example.test/advice" }],
  adequacyDecision: false,
};

const destination = DestinationPack.parse({
  country: "XX",
  currency: supported("currency", 1),
  timezone: supported("timeZone", 1),
  regions: [{ id: "north", label: "Norte" }],
  seasons: [],
  markets: { YY: marketInfo, WW: { ...marketInfo, adequacyDecision: true } },
});

const packs: InstancePacks = { market, destination };

// Plantilla (XX destino, YY mercado) ajustada para cumplir todas las reglas.
let base = InstanceConfig.parse(loadInstanceYaml("_template"));
base = withValue(base, "infra.region", "zz-south2");
base = withValue(base, "infra.bigqueryLocation", "ZZ");
base = withValue(base, "brand.displayName", "Marca de prueba");
const conforming = InstanceConfig.parse(base);

function resolved(instance: InstanceConfig = conforming): ResolvedInstanceConfig {
  const result = resolveInstance(instance, packs);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.config;
}

describe("resolveInstance", () => {
  it("devuelve una configuración que cumple ResolvedInstanceConfig", () => {
    expect(ResolvedInstanceConfig.safeParse(resolved()).success).toBe(true);
  });

  it("rellena desde el pack de mercado lo que la instancia omite", () => {
    const { market: resolvedMarket } = resolved();
    expect(resolvedMarket.locale).toBe(market.locale);
    expect(resolvedMarket.currency).toBe(market.currency);
    expect(resolvedMarket.timezone).toBe(market.timezone);
    expect(resolvedMarket.phoneDefaultRegion).toBe(market.phoneDefaultRegion);
  });

  it("los valores de la instancia ganan sobre los del pack", () => {
    const instance = withValue(conforming, "market.businessHours", {
      start: "10:00",
      end: "18:30",
      days: [2, 4],
    });
    const timezone = supported("timeZone", 2);
    const withZone = withValue(instance, "market.timezone", timezone);
    const config = resolved(withZone);
    expect(config.market.businessHours).toEqual({ start: "10:00", end: "18:30", days: [2, 4] });
    expect(config.market.timezone).toBe(timezone);
  });

  it("usa el horario del pack si la instancia no lo trae", () => {
    const { businessHours: _omitted, ...withoutHours } = conforming.market;
    void _omitted;
    const instance = InstanceConfig.parse({ ...conforming, market: withoutHours });
    expect(resolved(instance).market.businessHours).toEqual(market.businessHours);
  });

  it("toma agency.timezone del pack de destino si está vacía u omitida", () => {
    expect(resolved().agency.timezone).toBe(destination.timezone);
    const own = supported("timeZone", 3);
    expect(resolved(withValue(conforming, "agency.timezone", own)).agency.timezone).toBe(own);
  });

  it("sustituye {brand} en todos los textos del pack de mercado", () => {
    const config = resolved();
    expect(config.marketPack.aiDisclosure.text).toBe("Asistente de IA de Marca de prueba.");
    expect(config.marketPack.legalTexts.privacyNotice).toBe("Marca de prueba trata tus datos.");
    expect(JSON.stringify(config)).not.toContain(BRAND_PLACEHOLDER);
    // El pack original no se modifica.
    expect(market.aiDisclosure.text).toContain(BRAND_PLACEHOLDER);
  });

  it("usa el nombre de la instancia como marca si brand.displayName está vacío", () => {
    const instance = withValue(conforming, "brand.displayName", " ");
    expect(brandName(instance)).toBe(conforming.name);
    expect(resolved(instance).marketPack.aiDisclosure.text).toBe(
      `Asistente de IA de ${conforming.name}.`,
    );
  });

  it("reduce el pack de destino a la entrada del mercado de la instancia", () => {
    const config = resolved();
    expect(Object.keys(config.destinationPack.markets)).toEqual(["YY"]);
    expect(config.destinationPack.markets.YY).toEqual(marketInfo);
    expect(Object.keys(destination.markets)).toEqual(["YY", "WW"]);
  });

  it("falla si la instancia sobrescribe una clave bloqueada", () => {
    const instance = withValue(conforming, "market.currency", supported("currency", 2));
    const result = resolveInstance(instance, packs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => `${issue.rule} ${issue.path}`)).toEqual([
        "locked-override market.currency",
      ]);
    }
  });

  it("falla con las reglas cruzadas (región de BigQuery distinta) y sin packs", () => {
    const instance = withValue(conforming, "infra.bigqueryLocation", "QQ");
    const result = resolveInstance(instance, packs);
    expect(result.ok ? [] : result.issues.map((issue) => issue.rule)).toEqual(["data-region"]);
    const noPacks = resolveInstance(conforming, {});
    expect(noPacks.ok ? [] : noPacks.issues.map((issue) => issue.rule)).toEqual([
      "pack-missing",
      "pack-missing",
    ]);
  });

  it("falla en draft si la región o la ubicación de BigQuery están vacías", () => {
    let instance = withValue(conforming, "infra.region", "");
    instance = withValue(instance, "infra.bigqueryLocation", "");
    const result = resolveInstance(instance, packs);
    expect(result.ok ? [] : result.issues.map((issue) => `${issue.rule} ${issue.path}`)).toEqual([
      "data-region infra.region",
      "data-region infra.bigqueryLocation",
    ]);
  });
});

describe("ResolvedInstanceConfig", () => {
  it("rechaza campos de mercado sin resolver y un destino sin reducir", () => {
    const config = resolved();
    const { locale: _locale, ...market } = config.market;
    void _locale;
    expect(ResolvedInstanceConfig.safeParse({ ...config, market }).success).toBe(false);
    const unreduced = { ...config, destinationPack: destination };
    const result = ResolvedInstanceConfig.safeParse(unreduced);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toEqual([
      "destinationPack.markets",
    ]);
  });
});

describe("readResolvedInstance", () => {
  const dir = mkdtempSync(join(tmpdir(), "resolved-instance-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lee y valida el archivo generado", () => {
    const file = join(dir, "instance.json");
    writeFileSync(file, JSON.stringify(resolved()));
    expect(readResolvedInstance(file)).toEqual(resolved());
  });

  it("pide ejecutar instance:build si el archivo no existe", () => {
    expect(() => readResolvedInstance(join(dir, "missing.json"))).toThrow(
      /pnpm instance:build <id>/,
    );
  });

  it("nombra los campos inválidos", () => {
    const file = join(dir, "broken.json");
    writeFileSync(file, JSON.stringify(withValue(resolved(), "infra.region", "")));
    expect(() => readResolvedInstance(file)).toThrow(/infra\.region/);
    expect(() => parseResolvedInstance({})).toThrow(/instance:build/);
  });
});

describe("buildConfigDocs", () => {
  it("genera config/sla, config/agents y config/flags desde la configuración resuelta", () => {
    const config = resolved();
    const docs = buildConfigDocs(config);
    expect(docs.sla).toEqual({
      warnAfterMinutes: config.sla.warnAfterMinutes,
      breachAfterMinutes: config.sla.breachAfterMinutes,
      businessHours: config.market.businessHours,
      timezone: market.timezone,
    });
    expect(docs.agents).toEqual(config.agents);
    expect(docs.flags).toEqual({ mcpCatalog: config.features.mcpCatalog });
    expect(ConfigSla.safeParse(docs.sla).success).toBe(true);
    expect(ConfigAgents.safeParse(docs.agents).success).toBe(true);
    expect(ConfigFlags.safeParse(docs.flags).success).toBe(true);
  });

  it("usa la zona horaria del mercado resuelto, no la de la agencia", () => {
    const timezone = supported("timeZone", 4);
    const docs = buildConfigDocs(resolved(withValue(conforming, "market.timezone", timezone)));
    expect(docs.sla.timezone).toBe(timezone);
  });
});
