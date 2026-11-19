// Interfaz del CRM (docs/specs/003-on-lead-created.md). El proveedor real llega tras
// el ADR de CRM; hasta entonces solo existe el adaptador en memoria para desarrollo.
import type { Lead } from "@tla/shared";

/** Datos del lead que necesita el CRM. */
export type CrmLeadInput = Pick<Lead, "leadId" | "dedupeKey" | "source" | "contact" | "interest">;

/** IDs devueltos por el CRM: se guardan en `lead.crm`. */
export interface CrmUpsertResult {
  contactId: string;
  dealId: string;
}

/**
 * Crea o actualiza el contacto y el deal del lead. Debe ser idempotente por `leadId`
 * (Cloud Tasks reintenta) y lanzar si el CRM falla.
 */
export interface CrmAdapter {
  upsert(lead: CrmLeadInput): Promise<CrmUpsertResult>;
}
