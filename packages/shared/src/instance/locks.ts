import type { InstanceConfig } from "./instance-config.js";
import type { MarketPack, MarketPackLockableKey } from "./market-pack.js";

/**
 * Valor de una instancia que intenta sobrescribir una clave bloqueada por el
 * pack de mercado.
 */
export interface LockedOverride {
  /** Clave bloqueada del pack de mercado. */
  key: MarketPackLockableKey;
  /** Ruta con puntos del campo de la instancia que la sobrescribe. */
  path: string;
  /** Valor exigido por el pack (en `dataRegions`, la lista de regiones permitidas). */
  expected: unknown;
  /** Valor que trae la instancia. */
  actual: unknown;
  message: string;
}

/** Un valor ausente o vacío (`""`, instancia en `draft`) no sobrescribe nada. */
function isSet<T>(value: T | undefined): value is T {
  return value !== undefined && value !== "";
}

function sameBusinessHours(
  a: MarketPack["businessHours"],
  b: NonNullable<InstanceConfig["market"]["businessHours"]>,
): boolean {
  if (a.start !== b.start || a.end !== b.end) return false;
  const days = new Set(a.days);
  return a.days.length === b.days.length && b.days.every((day) => days.has(day));
}

type Check = (market: MarketPack, instance: InstanceConfig) => LockedOverride | undefined;

function mismatch(
  key: MarketPackLockableKey,
  path: string,
  expected: unknown,
  actual: unknown,
): LockedOverride {
  return {
    key,
    path,
    expected,
    actual,
    message: `${path} no puede sobrescribir «${key}»: el pack de mercado la bloquea (exige ${JSON.stringify(expected)}, la instancia trae ${JSON.stringify(actual)})`,
  };
}

function marketField(
  key: "locale" | "currency" | "timezone" | "phoneDefaultRegion",
): Check {
  return (market, instance) => {
    const actual = instance.market[key];
    if (!isSet(actual) || actual === market[key]) return undefined;
    return mismatch(key, `market.${key}`, market[key], actual);
  };
}

/**
 * Cómo se comprueba cada clave bloqueable contra la instancia.
 *
 * Las claves sin campo equivalente en `InstanceConfig` (`legalRegime`,
 * `internationalTransferWithoutAdequacy`, `aiDisclosure`, `legalTexts`,
 * `priceDisclaimer`, `agentTone`) no se pueden sobrescribir desde
 * `instance.yaml`: el esquema es estricto y rechaza campos desconocidos. Por
 * eso no tienen comprobación aquí. `compliance.internationalTransfer` no se
 * compara con `internationalTransferWithoutAdequacy`, porque depende de la
 * decisión de adecuación del destino (regla cruzada aparte).
 */
const CHECKS: Partial<Record<MarketPackLockableKey, Check>> = {
  locale: marketField("locale"),
  currency: marketField("currency"),
  timezone: marketField("timezone"),
  phoneDefaultRegion: marketField("phoneDefaultRegion"),
  businessHours: (market, instance) => {
    const actual = instance.market.businessHours;
    if (actual === undefined || sameBusinessHours(market.businessHours, actual)) return undefined;
    return mismatch("businessHours", "market.businessHours", market.businessHours, actual);
  },
  dataRegions: (market, instance) => {
    const actual = instance.infra.region;
    if (!isSet(actual) || market.dataRegions.includes(actual)) return undefined;
    return mismatch("dataRegions", "infra.region", market.dataRegions, actual);
  },
  bigqueryLocation: (market, instance) => {
    const actual = instance.infra.bigqueryLocation;
    if (!isSet(actual) || actual === market.bigqueryLocation) return undefined;
    return mismatch("bigqueryLocation", "infra.bigqueryLocation", market.bigqueryLocation, actual);
  },
  dataRetentionMonths: (market, instance) => {
    const actual = instance.compliance.dataRetentionMonths;
    if (actual === market.dataRetentionMonths) return undefined;
    return mismatch(
      "dataRetentionMonths",
      "compliance.dataRetentionMonths",
      market.dataRetentionMonths,
      actual,
    );
  },
};

/**
 * Lista los campos de `instance` que sobrescriben claves de `market.locked`.
 * Función pura: solo comprueba las claves bloqueadas por el pack; una lista
 * vacía significa que la instancia respeta los bloqueos.
 */
export function findLockedOverrides(
  market: MarketPack,
  instance: InstanceConfig,
): LockedOverride[] {
  const overrides: LockedOverride[] = [];
  for (const key of market.locked) {
    const override = CHECKS[key]?.(market, instance);
    if (override !== undefined) overrides.push(override);
  }
  return overrides;
}
