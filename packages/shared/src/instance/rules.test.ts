import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DestinationPack } from "./destination-pack.js";
import { InstanceConfig } from "./instance-config.js";
import { MarketPack } from "./market-pack.js";
import { RuleId, validateInstanceRules } from "./rules.js";

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
  aiDisclosure: { text: "Aviso de IA de prueba", version: "1.0.0" },
  legalTexts: { version: "1.0.0", privacyNotice: "Privacidad", commercialConsent: "Contacto" },
  priceDisclaimer: "Precio de prueba",
  agentTone: "Tono de prueba",
  locked: ["dataRegions", "bigqueryLocation", "dataRetentionMonths"],
});

const destination = DestinationPack.parse({
  country: "XX",
  currency: supported("currency", 1),
  timezone: supported("timeZone", 1),
  regions: [{ id: "north", label: "Norte" }],
  seasons: [],
  markets: {
    YY: {
      entryRequirements: [{ label: "Requisitos", url: "https://example.test/entry" }],
      travelAdvice: [{ label: "Avisos", url: "https://example.test/advice" }],
      adequacyDecision: false,
    },
  },
});

const packs = { market, destination };

/** Valores ficticios que el esquema exige fuera de draft. */
const FAKE_PHONE = `+${"1".repeat(10)}`;

// Plantilla (XX destino, YY mercado) ajustada para cumplir todas las reglas.
let base = InstanceConfig.parse(loadInstanceYaml("_template"));
base = withValue(base, "infra.region", "zz-south2");
base = withValue(base, "infra.bigqueryLocation", "ZZ");
base = withValue(base, "agents.qualification.enabled", true);
const conforming = InstanceConfig.parse(base);

function live(status: "pilot" | "active" | "paused"): InstanceConfig {
  let instance = withValue(conforming, "status", status);
  instance = withValue(instance, "agency.legalName", "Agencia de prueba");
  instance = withValue(instance, "partner.legalName", "Socio de prueba");
  instance = withValue(instance, "channels.whatsapp.number", FAKE_PHONE);
  instance = withValue(instance, "commission.rate", 0.1);
  return InstanceConfig.parse(instance);
}

function rules(instance: InstanceConfig, p = packs): string[] {
  return validateInstanceRules(instance, p).map((issue) => `${issue.rule} ${issue.path}`);
}

describe("validateInstanceRules", () => {
  it("no informa nada si la instancia respeta sus packs", () => {
    expect(validateInstanceRules(conforming, packs)).toEqual([]);
    expect(validateInstanceRules(live("pilot"), packs)).toEqual([]);
  });

  it("expone los ids de regla como enumeración", () => {
    expect(RuleId.options).toEqual([
      "pack-missing",
      "destination-market-missing",
      "data-region",
      "locked-override",
      "international-transfer",
      "ai-disclosure",
      "legal-texts-draft",
    ]);
  });

  describe("pack-missing", () => {
    it("informa del pack de mercado y de destino ausentes y omite el resto de reglas", () => {
      const broken = withValue(conforming, "infra.region", "zz-east3");
      expect(rules(broken, {})).toEqual([
        "pack-missing market.country",
        "pack-missing destination.country",
      ]);
    });

    it("con solo el pack de destino, aplica las reglas que no necesitan el de mercado", () => {
      const other = withValue(conforming, "market.country", "WW");
      expect(rules(other, { destination })).toEqual([
        "pack-missing market.country",
        "destination-market-missing market.country",
      ]);
    });
  });

  it("destination-market-missing: el destino no tiene entrada para el mercado", () => {
    const other = { ...market, country: "WW" };
    const instance = withValue(conforming, "market.country", "WW");
    expect(rules(instance, { market: other, destination })).toEqual([
      "destination-market-missing market.country",
    ]);
  });

  describe("data-region", () => {
    it("rechaza una región fuera de las del pack con un solo issue (sin locked-override)", () => {
      const issues = validateInstanceRules(
        withValue(conforming, "infra.region", "zz-east3"),
        packs,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ rule: "data-region", path: "infra.region" });
      expect(issues[0]?.message).toContain("YY (gdpr)");
      expect(issues[0]?.message).toContain("zz-north1, zz-south2");
    });

    it("rechaza una ubicación de BigQuery distinta de la del pack", () => {
      const issues = validateInstanceRules(
        withValue(conforming, "infra.bigqueryLocation", "WW"),
        packs,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ rule: "data-region", path: "infra.bigqueryLocation" });
    });

    it("se aplica aunque el pack no bloquee las claves de región", () => {
      const unlocked = { ...market, locked: [] };
      const instance = withValue(conforming, "infra.region", "zz-east3");
      expect(rules(instance, { market: unlocked, destination })).toEqual([
        "data-region infra.region",
      ]);
    });

    it("admite valores vacíos en draft y los exige fuera de draft", () => {
      let empty = withValue(conforming, "infra.region", "");
      empty = withValue(empty, "infra.bigqueryLocation", "");
      expect(rules(empty)).toEqual([]);
      let pilot = withValue(live("pilot"), "infra.region", "");
      pilot = withValue(pilot, "infra.bigqueryLocation", "");
      expect(rules(pilot)).toEqual([
        "data-region infra.region",
        "data-region infra.bigqueryLocation",
      ]);
    });
  });

  it("locked-override: informa del resto de claves bloqueadas", () => {
    const instance = withValue(conforming, "compliance.dataRetentionMonths", 36);
    const issues = validateInstanceRules(instance, packs);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: "locked-override",
      path: "compliance.dataRetentionMonths",
    });
  });

  describe("international-transfer", () => {
    it("exige el mecanismo del pack cuando el destino no tiene adecuación", () => {
      const instance = withValue(conforming, "compliance.internationalTransfer", "adequacy");
      const issues = validateInstanceRules(instance, packs);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        rule: "international-transfer",
        path: "compliance.internationalTransfer",
      });
      expect(issues[0]?.message).toContain("scc");
    });

    it("no aplica si el destino tiene decisión de adecuación", () => {
      const adequate = withValue(destination, "markets.YY.adequacyDecision", true);
      const instance = withValue(conforming, "compliance.internationalTransfer", "adequacy");
      expect(rules(instance, { market, destination: adequate })).toEqual([]);
    });
  });

  describe("ai-disclosure", () => {
    const withoutDisclosure = { ...market, aiDisclosure: undefined } as unknown as MarketPack;
    const blankDisclosure = { ...market, aiDisclosure: { text: "  ", version: "1.0.0" } };

    it("falla si hay un agente activo y el pack no trae aviso de IA", () => {
      expect(rules(conforming, { market: withoutDisclosure, destination })).toEqual([
        "ai-disclosure agents.qualification.enabled",
      ]);
      expect(rules(conforming, { market: blankDisclosure, destination })).toEqual([
        "ai-disclosure agents.qualification.enabled",
      ]);
    });

    it("también con el agente de propuestas", () => {
      let instance = withValue(conforming, "agents.qualification.enabled", false);
      instance = withValue(instance, "agents.proposal.enabled", true);
      expect(rules(instance, { market: withoutDisclosure, destination })).toEqual([
        "ai-disclosure agents.proposal.enabled",
      ]);
    });

    it("no aplica sin agentes activos", () => {
      const instance = withValue(conforming, "agents.qualification.enabled", false);
      expect(rules(instance, { market: withoutDisclosure, destination })).toEqual([]);
    });
  });

  describe("legal-texts-draft", () => {
    const draftLegal = withValue(market, "legalTexts.version", "draft");
    const draftDisclosure = withValue(market, "aiDisclosure.version", "draft");

    it.each(["pilot", "active", "paused"] as const)(
      "falla en %s si los textos legales del pack están en draft",
      (status) => {
        expect(rules(live(status), { market: draftLegal, destination })).toEqual([
          "legal-texts-draft status",
        ]);
      },
    );

    it("falla fuera de draft si un agente está activo y el aviso de IA está en draft", () => {
      const issues = validateInstanceRules(live("pilot"), { market: draftDisclosure, destination });
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain("aiDisclosure.version");
      const noAgents = withValue(live("pilot"), "agents.qualification.enabled", false);
      expect(rules(noAgents, { market: draftDisclosure, destination })).toEqual([]);
    });

    it("no aplica a instancias en draft", () => {
      expect(rules(conforming, { market: draftLegal, destination })).toEqual([]);
      expect(rules(conforming, { market: draftDisclosure, destination })).toEqual([]);
    });
  });
});
