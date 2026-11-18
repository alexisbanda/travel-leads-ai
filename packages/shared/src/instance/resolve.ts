import type { DestinationPack } from "./destination-pack.js";
import type { InstanceConfig } from "./instance-config.js";
import type { MarketPack } from "./market-pack.js";
import { ResolvedInstanceConfig } from "./resolved.js";
import { validateInstanceRules, type InstancePacks, type RuleId } from "./rules.js";

/**
 * Marcador de los textos del pack de mercado que se sustituye por la marca
 * de la instancia (`brand.displayName`, o `name` si aún está vacío).
 */
export const BRAND_PLACEHOLDER = "{brand}";

/**
 * Problema al resolver una instancia: una regla cruzada (`RuleId`) o
 * `resolved-schema` si la salida no cumple `ResolvedInstanceConfig`.
 */
export interface ResolveIssue {
  rule: RuleId | "resolved-schema";
  path: string;
  message: string;
}

export type ResolveResult =
  { ok: true; config: ResolvedInstanceConfig } | { ok: false; issues: ResolveIssue[] };

/** Marca que sustituye a `{brand}`: `brand.displayName` o, si está vacío, el nombre de la instancia. */
export function brandName(instance: InstanceConfig): string {
  const display = instance.brand.displayName.trim();
  return display !== "" ? display : instance.name.trim();
}

/** Copia profunda de `value` con `{brand}` sustituido en todas las cadenas. */
function replaceBrand<T>(value: T, brand: string): T {
  if (typeof value === "string") return value.split(BRAND_PLACEHOLDER).join(brand) as T;
  if (Array.isArray(value)) return value.map((item) => replaceBrand(item, brand)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceBrand(item, brand)]),
    ) as T;
  }
  return value;
}

/** Issues de región de datos vacía: la configuración resuelta las necesita aunque la instancia esté en draft. */
function missingDataRegion(instance: InstanceConfig, market: MarketPack): ResolveIssue[] {
  const issues: ResolveIssue[] = [];
  const reason = "necesario para generar la configuración resuelta";
  if (instance.infra.region === "") {
    issues.push({
      rule: "data-region",
      path: "infra.region",
      message: `${reason}; el mercado ${market.country} permite: ${market.dataRegions.join(", ")}`,
    });
  }
  if (instance.infra.bigqueryLocation === "") {
    issues.push({
      rule: "data-region",
      path: "infra.bigqueryLocation",
      message: `${reason}; el mercado ${market.country} exige ${market.bigqueryLocation}`,
    });
  }
  return issues;
}

function reduceDestination(destination: DestinationPack, country: string): DestinationPack {
  const info = Object.hasOwn(destination.markets, country)
    ? destination.markets[country]
    : undefined;
  return { ...destination, markets: info === undefined ? {} : { [country]: info } };
}

/**
 * Resuelve la instancia con sus packs. Función pura: primero aplica las
 * reglas cruzadas (cualquier issue, incluido un override de una clave
 * bloqueada, hace fallar), después rellena desde los packs solo lo que la
 * instancia omite (la instancia gana), sustituye `{brand}` en los textos del
 * pack de mercado y valida la salida con `ResolvedInstanceConfig`.
 */
export function resolveInstance(instance: InstanceConfig, packs: InstancePacks): ResolveResult {
  const issues: ResolveIssue[] = validateInstanceRules(instance, packs);
  const { market, destination } = packs;
  if (issues.length > 0 || market === undefined || destination === undefined) {
    return { ok: false, issues };
  }
  const missing = missingDataRegion(instance, market);
  if (missing.length > 0) return { ok: false, issues: missing };

  const country = instance.market.country;
  const agencyTimezone = instance.agency.timezone;
  const candidate = {
    ...instance,
    agency: {
      ...instance.agency,
      timezone:
        agencyTimezone === undefined || agencyTimezone === ""
          ? destination.timezone
          : agencyTimezone,
    },
    market: {
      country,
      locale: instance.market.locale ?? market.locale,
      currency: instance.market.currency ?? market.currency,
      timezone: instance.market.timezone ?? market.timezone,
      phoneDefaultRegion: instance.market.phoneDefaultRegion ?? market.phoneDefaultRegion,
      businessHours: instance.market.businessHours ?? market.businessHours,
    },
    marketPack: replaceBrand(market, brandName(instance)),
    destinationPack: reduceDestination(destination, country),
  };

  const result = ResolvedInstanceConfig.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        rule: "resolved-schema",
        path: issue.path.length > 0 ? issue.path.join(".") : "(raíz)",
        message: issue.message,
      })),
    };
  }
  return { ok: true, config: result.data };
}
