import type { CrmAdapter, CrmLeadInput, CrmUpsertResult } from "./crm-adapter.js";

/**
 * Adaptador en memoria (`channels.crm.provider: memory`), solo para desarrollo y tests.
 * Un contacto por `dedupeKey` (la misma persona) y un deal por `leadId`; repetir
 * `upsert` devuelve los mismos IDs.
 */
export class InMemoryCrmAdapter implements CrmAdapter {
  readonly contacts = new Map<string, { contactId: string; lead: CrmLeadInput }>();
  readonly deals = new Map<string, { dealId: string; contactId: string }>();

  async upsert(lead: CrmLeadInput): Promise<CrmUpsertResult> {
    let contact = this.contacts.get(lead.dedupeKey);
    if (contact === undefined) {
      contact = { contactId: `mem-contact-${this.contacts.size + 1}`, lead };
    } else {
      contact = { ...contact, lead };
    }
    this.contacts.set(lead.dedupeKey, contact);

    const deal = this.deals.get(lead.leadId) ?? {
      dealId: `mem-deal-${this.deals.size + 1}`,
      contactId: contact.contactId,
    };
    this.deals.set(lead.leadId, deal);
    return { contactId: contact.contactId, dealId: deal.dealId };
  }
}
