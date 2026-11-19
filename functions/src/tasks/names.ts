import type { LeadTaskAction } from "../domain/lead-tasks.js";

/**
 * Nombre exportado en `index.ts` de la función `onTaskDispatched` de cada acción.
 * Es también el nombre de su cola en Cloud Tasks: deben coincidir.
 */
export const LEAD_TASK_FUNCTIONS = {
  "crm.upsert": "crmUpsertTask",
  "agency.notify": "agencyNotifyTask",
  "meta.capi.lead": "metaCapiLeadTask",
} as const satisfies Record<LeadTaskAction, string>;
