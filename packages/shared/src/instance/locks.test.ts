import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { InstanceConfig } from "./instance-config.js";
import { MarketPack, MarketPackLockableKey } from "./market-pack.js";
import { findLockedOverrides } from "./locks.js";

// Utilidades de test (duplicadas en cada archivo de test para no publicarlas en el build).
/** Primer valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
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

// Pack ficticio: ningún valor corresponde a un mercado real.
const ALL_KEYS = MarketPackLockableKey.options;
const pack = MarketPack.parse({
  country: "ZZ",
  locale: "zz-ZZ",
  currency: supported("currency", 0),
  timezone: supported("timeZone", 0),
  phoneDefaultRegion: "ZZ",
  businessHours: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
  legalRegime: "other",
  dataRegions: ["zz-north1", "zz-south2"],
  bigqueryLocation: "ZZ",
  dataRetentionMonths: 12,
  internationalTransferWithoutAdequacy: "scc",
  aiDisclosure: { text: "Aviso de IA de prueba", version: "draft" },
  legalTexts: {
    version: "draft",
    privacyNotice: "Privacidad",
    commercialConsent: "Contacto",
    pages: [{ slug: "privacidad", title: "Privacidad", body: "Texto de prueba." }],
  },
  priceDisclaimer: "Precio de prueba",
  agentTone: "Tono de prueba",
  locked: ALL_KEYS,
});
const unlocked = { ...pack, locked: [] };

// Instancia de la plantilla, ajustada para respetar todos los valores del pack.
const template = InstanceConfig.parse(loadInstanceYaml("_template"));
let instance = withValue(template, "market.country", "ZZ");
instance = withValue(instance, "market.businessHours", structuredClone(pack.businessHours));
instance = withValue(instance, "infra.region", "zz-south2");
instance = withValue(instance, "infra.bigqueryLocation", "ZZ");
instance = withValue(instance, "compliance.dataRetentionMonths", 12);
const conforming = InstanceConfig.parse(instance);

const OTHER_CURRENCY = supported("currency", 1);
const OTHER_TIME_ZONE = supported("timeZone", 1);

const OVERRIDES: Array<{ key: MarketPackLockableKey; path: string; value: unknown }> = [
  { key: "locale", path: "market.locale", value: "zz-YY" },
  { key: "currency", path: "market.currency", value: OTHER_CURRENCY },
  { key: "timezone", path: "market.timezone", value: OTHER_TIME_ZONE },
  { key: "phoneDefaultRegion", path: "market.phoneDefaultRegion", value: "YY" },
  {
    key: "businessHours",
    path: "market.businessHours",
    value: { start: "08:00", end: "22:00", days: [1, 2, 3, 4, 5] },
  },
  { key: "dataRegions", path: "infra.region", value: "zz-east3" },
  { key: "bigqueryLocation", path: "infra.bigqueryLocation", value: "YY" },
  { key: "dataRetentionMonths", path: "compliance.dataRetentionMonths", value: 36 },
];

describe("findLockedOverrides", () => {
  it("no informa nada si la instancia respeta todos los bloqueos", () => {
    expect(findLockedOverrides(pack, conforming)).toEqual([]);
  });

  it("trata los valores vacíos u omitidos de una instancia draft como no establecidos", () => {
    // La plantilla trae infra.region y infra.bigqueryLocation vacíos y sin locale/currency/…
    const draft = withValue(conforming, "infra.region", "");
    const empty = withValue(draft, "infra.bigqueryLocation", "");
    const { businessHours: _omit, ...market } = empty.market;
    void _omit;
    expect(findLockedOverrides(pack, InstanceConfig.parse({ ...empty, market }))).toEqual([]);
  });

  it("acepta los mismos días de atención en otro orden", () => {
    const reordered = withValue(conforming, "market.businessHours.days", [5, 4, 3, 2, 1]);
    expect(findLockedOverrides(pack, InstanceConfig.parse(reordered))).toEqual([]);
  });

  it.each(OVERRIDES)("informa de $path si sobrescribe la clave bloqueada $key", (c) => {
    const overriding = InstanceConfig.parse(withValue(conforming, c.path, c.value));
    const result = findLockedOverrides(pack, overriding);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: c.key, path: c.path, actual: c.value });
    expect(result[0]?.message).toContain(c.path);
  });

  it("informa de la lista de regiones permitidas como valor esperado", () => {
    const overriding = InstanceConfig.parse(withValue(conforming, "infra.region", "zz-east3"));
    expect(findLockedOverrides(pack, overriding)[0]?.expected).toEqual(pack.dataRegions);
  });

  it.each(OVERRIDES)("no comprueba $key si el pack no la bloquea", (c) => {
    const overriding = InstanceConfig.parse(withValue(conforming, c.path, c.value));
    expect(findLockedOverrides(unlocked, overriding)).toEqual([]);
  });

  it("informa de todas las sobrescrituras a la vez", () => {
    let overriding = conforming;
    for (const c of OVERRIDES) overriding = withValue(overriding, c.path, c.value);
    const keys = findLockedOverrides(pack, InstanceConfig.parse(overriding)).map((o) => o.key);
    expect(keys.sort()).toEqual(OVERRIDES.map((c) => c.key).sort());
  });

  it("no puede haber sobrescrituras de las claves sin campo en la instancia", () => {
    for (const field of ["aiDisclosure", "legalTexts", "priceDisclaimer", "agentTone"]) {
      const extra = withValue(conforming, `market.${field}`, "otro valor");
      expect(InstanceConfig.safeParse(extra).success).toBe(false);
    }
  });
});
