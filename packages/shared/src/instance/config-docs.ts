import { z } from "zod";
import { InstanceConfigObject } from "./instance-config.js";
import { BusinessHours, TimeZone } from "./primitives.js";
import type { ResolvedInstanceConfig } from "./resolved.js";

/** Documento `config/sla`: umbrales de primera respuesta y horario de atención. */
export const ConfigSla = z
  .object({
    warnAfterMinutes: z.number().int().positive(),
    breachAfterMinutes: z.number().int().positive(),
    /** Horario de atención, en `timezone`. */
    businessHours: BusinessHours,
    /** Zona horaria del mercado resuelto. */
    timezone: TimeZone,
  })
  .strict();
export type ConfigSla = z.infer<typeof ConfigSla>;

/** Documento `config/agents`: activación y modo de los agentes. */
export const ConfigAgents = InstanceConfigObject.shape.agents;
export type ConfigAgents = z.infer<typeof ConfigAgents>;

/** Documento `config/flags`: flags de funcionalidades. */
export const ConfigFlags = InstanceConfigObject.shape.features;
export type ConfigFlags = z.infer<typeof ConfigFlags>;

/** Ids de los documentos de la colección `config` que siembra `instance:seed`. */
export const CONFIG_DOC_IDS = ["sla", "agents", "flags"] as const;
export type ConfigDocId = (typeof CONFIG_DOC_IDS)[number];

export interface ConfigDocs {
  sla: ConfigSla;
  agents: ConfigAgents;
  flags: ConfigFlags;
}

/** Documentos operativos de `config/*` a partir de la configuración resuelta. Función pura. */
export function buildConfigDocs(resolved: ResolvedInstanceConfig): ConfigDocs {
  return {
    sla: ConfigSla.parse({
      warnAfterMinutes: resolved.sla.warnAfterMinutes,
      breachAfterMinutes: resolved.sla.breachAfterMinutes,
      businessHours: resolved.market.businessHours,
      timezone: resolved.market.timezone,
    }),
    agents: ConfigAgents.parse(resolved.agents),
    flags: ConfigFlags.parse(resolved.features),
  };
}
