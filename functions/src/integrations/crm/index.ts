import type { ResolvedInstanceConfig } from "@tla/shared";
import type { CrmAdapter } from "./crm-adapter.js";
import { InMemoryCrmAdapter } from "./in-memory-crm-adapter.js";

export type { CrmAdapter, CrmLeadInput, CrmUpsertResult } from "./crm-adapter.js";
export { InMemoryCrmAdapter } from "./in-memory-crm-adapter.js";

/** Parte de la configuración resuelta que elige el CRM. */
export interface CrmConfig {
  channels: { crm: { provider: ResolvedInstanceConfig["channels"]["crm"]["provider"] } };
}

let memoryAdapter: InMemoryCrmAdapter | undefined;

/**
 * Adaptador del proveedor configurado, o `null` si aún no hay implementación
 * (`hubspot` y `pipedrive` hasta el ADR de CRM). La tarea `crm.upsert` registra
 * entonces `skipped`: nunca se inventan IDs.
 */
export function crmAdapterFor(config: CrmConfig): CrmAdapter | null {
  switch (config.channels.crm.provider) {
    case "memory":
      return (memoryAdapter ??= new InMemoryCrmAdapter());
    case "hubspot":
    case "pipedrive":
      return null;
  }
}
