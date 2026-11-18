import { z } from "zod";
import type { DestinationPack } from "./destination-pack.js";
import type { InstanceConfig } from "./instance-config.js";
import { findLockedOverrides } from "./locks.js";
import type { MarketPack, MarketPackLockableKey } from "./market-pack.js";

/** Identificador de cada regla cruzada entre la instancia y sus packs. */
export const RuleId = z.enum([
  "pack-missing",
  "destination-market-missing",
  "data-region",
  "locked-override",
  "international-transfer",
  "ai-disclosure",
  "legal-texts-draft",
]);
export type RuleId = z.infer<typeof RuleId>;

/** Incumplimiento de una regla cruzada. */
export interface RuleIssue {
  rule: RuleId;
  /** Ruta con puntos del campo de la instancia afectado. */
  path: string;
  message: string;
}

/**
 * Packs que corresponden a la instancia (`market.country` y
 * `destination.country`); `undefined` si el registro no tiene ese pack.
 */
export interface InstancePacks {
  market?: MarketPack;
  destination?: DestinationPack;
}

/** Versión de los textos pendientes de revisión legal. */
const DRAFT_VERSION = "draft";

/**
 * Precedencia: `infra.region` e `infra.bigqueryLocation` se comprueban
 * siempre con `data-region`, estén o no bloqueadas por el pack; por eso
 * `locked-override` excluye estas claves y cada campo da un solo issue.
 */
const KEYS_CHECKED_BY_DATA_REGION: ReadonlySet<MarketPackLockableKey> = new Set([
  "dataRegions",
  "bigqueryLocation",
]);

function issue(rule: RuleId, path: string, message: string): RuleIssue {
  return { rule, path, message };
}

function marketLabel(market: MarketPack): string {
  return `el mercado ${market.country} (${market.legalRegime})`;
}

/** Rutas de los agentes activos que hablan con viajeros. */
function enabledAgentPaths(instance: InstanceConfig): string[] {
  const paths: string[] = [];
  if (instance.agents.qualification.enabled) paths.push("agents.qualification.enabled");
  if (instance.agents.proposal.enabled) paths.push("agents.proposal.enabled");
  return paths;
}

/**
 * El esquema `MarketPack` exige el aviso de IA y los textos legales, pero las
 * reglas no se fían de que el pack se haya validado: los leen como opcionales.
 */
function looseMarket(market: MarketPack): Partial<MarketPack> {
  return market;
}

function packMissing(instance: InstanceConfig, packs: InstancePacks): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (packs.market === undefined) {
    issues.push(
      issue(
        "pack-missing",
        "market.country",
        `no existe pack de mercado para ${instance.market.country} (packages/markets)`,
      ),
    );
  }
  if (packs.destination === undefined) {
    issues.push(
      issue(
        "pack-missing",
        "destination.country",
        `no existe pack de destino para ${instance.destination.country} (packages/destinations)`,
      ),
    );
  }
  return issues;
}

function destinationMarket(
  instance: InstanceConfig,
  destination: DestinationPack,
): DestinationPack["markets"][string] | undefined {
  const country = instance.market.country;
  return Object.hasOwn(destination.markets, country) ? destination.markets[country] : undefined;
}

function destinationMarketMissing(
  instance: InstanceConfig,
  destination: DestinationPack,
): RuleIssue[] {
  if (destinationMarket(instance, destination) !== undefined) return [];
  return [
    issue(
      "destination-market-missing",
      "market.country",
      `el pack de destino ${destination.country} no tiene información para el mercado ${instance.market.country} (markets.${instance.market.country})`,
    ),
  ];
}

function dataRegion(instance: InstanceConfig, market: MarketPack): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const label = marketLabel(market);
  const required = instance.status !== "draft";
  const { region, bigqueryLocation } = instance.infra;

  const allowed = `${label} solo permite estas regiones de datos: ${market.dataRegions.join(", ")}`;
  if (region === "") {
    if (required) {
      issues.push(issue("data-region", "infra.region", `obligatorio fuera de draft; ${allowed}`));
    }
  } else if (!market.dataRegions.includes(region)) {
    issues.push(issue("data-region", "infra.region", `${allowed} (la instancia trae ${region})`));
  }

  const location = `${label} exige la ubicación de BigQuery ${market.bigqueryLocation}`;
  if (bigqueryLocation === "") {
    if (required) {
      issues.push(
        issue("data-region", "infra.bigqueryLocation", `obligatorio fuera de draft; ${location}`),
      );
    }
  } else if (bigqueryLocation !== market.bigqueryLocation) {
    issues.push(
      issue(
        "data-region",
        "infra.bigqueryLocation",
        `${location} (la instancia trae ${bigqueryLocation})`,
      ),
    );
  }
  return issues;
}

function lockedOverride(instance: InstanceConfig, market: MarketPack): RuleIssue[] {
  return findLockedOverrides(market, instance)
    .filter((override) => !KEYS_CHECKED_BY_DATA_REGION.has(override.key))
    .map((override) => issue("locked-override", override.path, override.message));
}

function internationalTransfer(
  instance: InstanceConfig,
  market: MarketPack,
  destination: DestinationPack,
): RuleIssue[] {
  const info = destinationMarket(instance, destination);
  if (info === undefined || info.adequacyDecision) return [];
  const expected = market.internationalTransferWithoutAdequacy;
  const actual = instance.compliance.internationalTransfer;
  if (actual === expected) return [];
  return [
    issue(
      "international-transfer",
      "compliance.internationalTransfer",
      `el destino ${destination.country} no tiene decisión de adecuación para ${marketLabel(market)}, que exige ${expected} (la instancia trae ${actual})`,
    ),
  ];
}

function aiDisclosure(instance: InstanceConfig, market: MarketPack): RuleIssue[] {
  const [firstAgent] = enabledAgentPaths(instance);
  if (firstAgent === undefined) return [];
  const text = looseMarket(market).aiDisclosure?.text;
  if (typeof text === "string" && text.trim() !== "") return [];
  return [
    issue(
      "ai-disclosure",
      firstAgent,
      `hay un agente activo y el pack de mercado ${market.country} no trae aviso de IA (aiDisclosure.text); el aviso es obligatorio y no se puede desactivar`,
    ),
  ];
}

function legalTextsDraft(instance: InstanceConfig, market: MarketPack): RuleIssue[] {
  if (instance.status === "draft") return [];
  const issues: RuleIssue[] = [];
  const pack = looseMarket(market);
  const advice = "publica una versión revisada en el pack o deja la instancia en draft";
  if (pack.legalTexts?.version === DRAFT_VERSION) {
    issues.push(
      issue(
        "legal-texts-draft",
        "status",
        `la instancia está en ${instance.status} y los textos legales del pack de mercado ${market.country} siguen en borrador (legalTexts.version: ${DRAFT_VERSION}); ${advice}`,
      ),
    );
  }
  if (enabledAgentPaths(instance).length > 0 && pack.aiDisclosure?.version === DRAFT_VERSION) {
    issues.push(
      issue(
        "legal-texts-draft",
        "status",
        `la instancia está en ${instance.status} con un agente activo y el aviso de IA del pack de mercado ${market.country} sigue en borrador (aiDisclosure.version: ${DRAFT_VERSION}); ${advice}`,
      ),
    );
  }
  return issues;
}

/**
 * Aplica las reglas que cruzan la instancia con sus packs de mercado y
 * destino. Función pura; lista vacía = la instancia es coherente con sus
 * packs. Si falta un pack, se informa con `pack-missing` y se omiten las
 * reglas que lo necesitan.
 */
export function validateInstanceRules(instance: InstanceConfig, packs: InstancePacks): RuleIssue[] {
  const { market, destination } = packs;
  const issues = packMissing(instance, packs);
  if (destination !== undefined) issues.push(...destinationMarketMissing(instance, destination));
  if (market !== undefined) {
    issues.push(...dataRegion(instance, market));
    issues.push(...lockedOverride(instance, market));
    if (destination !== undefined) {
      issues.push(...internationalTransfer(instance, market, destination));
    }
    issues.push(...aiDisclosure(instance, market));
    issues.push(...legalTextsDraft(instance, market));
  }
  return issues;
}
