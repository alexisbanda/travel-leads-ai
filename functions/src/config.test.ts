import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DestinationPack,
  InstanceConfig,
  MarketPack,
  resolveInstance,
  type ResolvedInstanceConfig,
} from "@tla/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  DEFAULT_INSTANCE_CONFIG_PATH,
  INSTANCE_CONFIG_ENV,
  instanceConfigPath,
  loadInstanceConfig,
} from "./config.js";

vi.mock("firebase-functions/v2", () => ({ setGlobalOptions: vi.fn() }));

/** Valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
function supported(kind: "currency" | "timeZone", index: number): string {
  const value = Intl.supportedValuesOf(kind)[index];
  if (value === undefined) throw new Error(`Intl no expone valores de ${kind}`);
  return value;
}

/** Región sintética: no corresponde a ninguna región real. */
const REGION = "zz-south2";

/** Configuración resuelta ficticia a partir de la plantilla y packs inventados. */
function syntheticConfig(): ResolvedInstanceConfig {
  const file = fileURLToPath(new URL("../../instances/_template/instance.yaml", import.meta.url));
  const raw = parse(readFileSync(file, "utf8")) as { infra: Record<string, unknown> };
  raw.infra.region = REGION;
  raw.infra.bigqueryLocation = "ZZ";
  const instance = InstanceConfig.parse(raw);
  const market = MarketPack.parse({
    country: instance.market.country,
    locale: "zz-YY",
    currency: supported("currency", 0),
    timezone: supported("timeZone", 0),
    phoneDefaultRegion: instance.market.country,
    businessHours: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
    legalRegime: "gdpr",
    dataRegions: [REGION],
    bigqueryLocation: "ZZ",
    dataRetentionMonths: 24,
    internationalTransferWithoutAdequacy: "scc",
    aiDisclosure: { text: "Aviso de IA de {brand}", version: "1.0.0" },
    legalTexts: { version: "1.0.0", privacyNotice: "Privacidad", commercialConsent: "Contacto" },
    priceDisclaimer: "Precio de prueba",
    agentTone: "Tono de prueba",
    locked: [],
  });
  const destination = DestinationPack.parse({
    country: instance.destination.country,
    currency: supported("currency", 1),
    timezone: supported("timeZone", 1),
    regions: [{ id: "north", label: "Norte" }],
    seasons: [],
    markets: {
      [instance.market.country]: {
        entryRequirements: [{ label: "Requisitos", url: "https://example.test/entry" }],
        travelAdvice: [{ label: "Avisos", url: "https://example.test/advice" }],
        adequacyDecision: false,
      },
    },
  });
  const result = resolveInstance(instance, { market, destination });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.config;
}

const dir = mkdtempSync(join(tmpdir(), "functions-config-"));
const configFile = join(dir, "instance.json");
writeFileSync(configFile, JSON.stringify(syntheticConfig()));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("loadInstanceConfig", () => {
  it("usa TLA_INSTANCE_CONFIG si está definida y, si no, generated/instance.json", () => {
    expect(instanceConfigPath({ [INSTANCE_CONFIG_ENV]: configFile })).toBe(configFile);
    expect(instanceConfigPath({})).toBe(DEFAULT_INSTANCE_CONFIG_PATH);
    expect(DEFAULT_INSTANCE_CONFIG_PATH).toMatch(/[/\\]generated[/\\]instance\.json$/);
  });

  it("lee la configuración resuelta", () => {
    expect(loadInstanceConfig(configFile).infra.region).toBe(REGION);
  });

  it("pide ejecutar instance:build si falta el archivo", () => {
    expect(() => loadInstanceConfig(join(dir, "missing.json"))).toThrow(/instance:build/);
  });
});

describe("index", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv(INSTANCE_CONFIG_ENV, configFile);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fija la región global de las functions con la de la configuración", async () => {
    const { setGlobalOptions } = await import("firebase-functions/v2");
    await import("./index.js");
    expect(setGlobalOptions).toHaveBeenCalledWith({ region: REGION });
  });
});
