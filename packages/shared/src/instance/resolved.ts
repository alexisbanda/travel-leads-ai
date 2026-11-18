import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DestinationPack } from "./destination-pack.js";
import { InstanceConfigObject, refineInstanceConfig } from "./instance-config.js";
import { MarketPack } from "./market-pack.js";
import {
  BigQueryLocation,
  BusinessHours,
  CountryCode,
  CurrencyCode,
  GcpRegion,
  Locale,
  TimeZone,
} from "./primitives.js";

const shape = InstanceConfigObject.shape;

/**
 * Configuración resuelta de una instancia (`generated/instance.json`): la
 * instancia con los valores por defecto de sus packs ya aplicados, más los
 * packs de mercado y destino. Es lo que leen landings, functions y MCP.
 */
export const ResolvedInstanceConfig = InstanceConfigObject.extend({
  agency: shape.agency.extend({ timezone: TimeZone }).strict(),
  market: shape.market
    .extend({
      locale: Locale,
      currency: CurrencyCode,
      timezone: TimeZone,
      phoneDefaultRegion: CountryCode,
      businessHours: BusinessHours,
    })
    .strict(),
  infra: shape.infra.extend({ region: GcpRegion, bigqueryLocation: BigQueryLocation }).strict(),
  /** Pack de mercado con el marcador `{brand}` ya sustituido. */
  marketPack: MarketPack,
  /** Pack de destino con `markets` reducido a la entrada del mercado de la instancia. */
  destinationPack: DestinationPack,
})
  .strict()
  .superRefine((config, ctx) => {
    refineInstanceConfig(config, ctx);
    if (config.marketPack.country !== config.market.country) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["marketPack", "country"],
        message: `el pack de mercado no corresponde a market.country (${config.market.country})`,
      });
    }
    if (config.destinationPack.country !== config.destination.country) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationPack", "country"],
        message: `el pack de destino no corresponde a destination.country (${config.destination.country})`,
      });
    }
    const markets = Object.keys(config.destinationPack.markets);
    if (markets.length !== 1 || markets[0] !== config.market.country) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationPack", "markets"],
        message: `debe contener solo la entrada del mercado ${config.market.country}`,
      });
    }
  });
export type ResolvedInstanceConfig = z.infer<typeof ResolvedInstanceConfig>;

/** Ruta del archivo generado, relativa a la raíz del repositorio. */
export const RESOLVED_INSTANCE_FILE = "generated/instance.json";

/** Valida un JSON ya parseado contra `ResolvedInstanceConfig`; lanza un error con los campos si no cumple. */
export function parseResolvedInstance(json: unknown): ResolvedInstanceConfig {
  const result = ResolvedInstanceConfig.safeParse(json);
  if (result.success) return result.data;
  const fields = result.error.issues.map(
    (issue) => `  ${issue.path.length > 0 ? issue.path.join(".") : "(raíz)"}: ${issue.message}`,
  );
  throw new Error(
    [
      "la configuración resuelta no es válida; vuelve a ejecutar `pnpm instance:build <id>`:",
      ...fields,
    ].join("\n"),
  );
}

/** Lee y valida la configuración resuelta de `path` (normalmente `generated/instance.json`). */
export function readResolvedInstance(path: string): ResolvedInstanceConfig {
  if (!existsSync(path)) {
    throw new Error(
      `no existe la configuración resuelta ${path}: ejecuta \`pnpm instance:build <id>\` para generarla`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`no se pudo leer la configuración resuelta ${path}: ${reason}`);
  }
  try {
    return parseResolvedInstance(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: ${reason}`);
  }
}
