import { describe, expect, it } from "vitest";
import { crmAdapterFor, InMemoryCrmAdapter, type CrmLeadInput } from "./index.js";

// Datos ficticios evidentes.
const lead = (leadId: string, dedupeKey: string): CrmLeadInput => ({
  leadId,
  dedupeKey,
  source: "landing",
  contact: { name: "Persona Ficticia", email: "qa@example.test", country: "XX", language: "xx" },
  interest: { tourIds: [] },
});

describe("InMemoryCrmAdapter", () => {
  it("guarda contacto y deal y devuelve los mismos IDs al repetir", async () => {
    const crm = new InMemoryCrmAdapter();
    const first = await crm.upsert(lead("L1", "a".repeat(64)));
    const again = await crm.upsert(lead("L1", "a".repeat(64)));
    expect(first).toEqual({ contactId: "mem-contact-1", dealId: "mem-deal-1" });
    expect(again).toEqual(first);
    expect(crm.contacts.size).toBe(1);
    expect(crm.deals.size).toBe(1);
  });

  it("la misma persona con otro lead reutiliza el contacto y crea otro deal", async () => {
    const crm = new InMemoryCrmAdapter();
    await crm.upsert(lead("L1", "a".repeat(64)));
    const second = await crm.upsert(lead("L2", "a".repeat(64)));
    expect(second).toEqual({ contactId: "mem-contact-1", dealId: "mem-deal-2" });
  });
});

describe("crmAdapterFor", () => {
  it("memory → adaptador en memoria (el mismo en todo el proceso)", () => {
    const config = { channels: { crm: { provider: "memory" as const } } };
    const adapter = crmAdapterFor(config);
    expect(adapter).toBeInstanceOf(InMemoryCrmAdapter);
    expect(crmAdapterFor(config)).toBe(adapter);
  });

  it.each(["hubspot", "pipedrive"] as const)("%s → null (sin adaptador todavía)", (provider) => {
    expect(crmAdapterFor({ channels: { crm: { provider } } })).toBeNull();
  });
});
