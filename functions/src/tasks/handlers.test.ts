import { describe, expect, it } from "vitest";
import type { LeadEvent } from "@tla/shared";
import { InMemoryCrmAdapter, type CrmAdapter } from "../integrations/crm/index.js";
import type { Notifier, NotifierResolution } from "../integrations/notifier/index.js";
import { fakeLeadDoc, TEST_LEAD_ID, TEST_NOW } from "./fake-lead.js";
import {
  createAgencyNotifyHandler,
  createCrmUpsertHandler,
  createMetaCapiLeadHandler,
  type LeadTaskDeps,
  type TaskLogFields,
} from "./handlers.js";
import type { LeadTaskStore } from "./lead-task-store.js";

class CrmUnavailableError extends Error {
  override name = "CrmUnavailableError";
}

/** Store en memoria con un lead ficticio. */
function setup(leads: Record<string, Record<string, unknown>> = { [TEST_LEAD_ID]: fakeLeadDoc() }) {
  const events: { leadId: string; event: LeadEvent }[] = [];
  const crmIds: Record<string, unknown> = {};
  const logs: { level: string; message: string; fields: TaskLogFields }[] = [];
  let seq = 0;
  const store: LeadTaskStore = {
    loadLead: async (leadId) => leads[leadId] ?? null,
    addEvent: async (leadId, _eventId, event) => void events.push({ leadId, event }),
    saveCrmIds: async (leadId, ids, _eventId, event) => {
      crmIds[leadId] = ids;
      events.push({ leadId, event });
    },
  };
  const log = (level: string) => (message: string, fields: TaskLogFields) =>
    logs.push({ level, message, fields });
  const deps: LeadTaskDeps = {
    store,
    newId: () => `evt-${++seq}`,
    now: () => TEST_NOW,
    log: { info: log("info"), warn: log("warn"), error: log("error") },
  };
  const types = () => events.map((e) => e.event.type);
  return { deps, events, crmIds, logs, types };
}

const payload = { leadId: TEST_LEAD_ID };
const throwingCrm: CrmAdapter = {
  upsert: async () => {
    throw new CrmUnavailableError("detalle con datos que no deben salir");
  },
};
const okNotifier = () => {
  const notified: string[] = [];
  const notifier: Notifier = { notify: async (lead) => void notified.push(lead.leadId) };
  const resolution: NotifierResolution = { status: "ready", channel: "email", notifier };
  return { notified, resolution };
};

describe("crm.upsert", () => {
  it("con el adaptador en memoria guarda los IDs y registra succeeded", async () => {
    const t = setup();
    const crm = new InMemoryCrmAdapter();
    await createCrmUpsertHandler({ ...t.deps, crm: () => crm })(payload);
    expect(t.crmIds[TEST_LEAD_ID]).toEqual({ contactId: "mem-contact-1", dealId: "mem-deal-1" });
    expect(t.events).toEqual([
      {
        leadId: TEST_LEAD_ID,
        event: { type: "crm.upsert.succeeded", actor: "system", at: TEST_NOW },
      },
    ]);
  });

  it("sin adaptador registra skipped not_implemented, sin IDs y sin lanzar", async () => {
    const t = setup();
    await createCrmUpsertHandler({ ...t.deps, crm: () => null })(payload);
    expect(t.crmIds).toEqual({});
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "crm.upsert.skipped", actor: "system", at: TEST_NOW, detail: "not_implemented" },
    ]);
  });

  it("si el CRM lanza registra failed con el nombre del error y re-lanza para reintentar", async () => {
    const t = setup();
    await expect(
      createCrmUpsertHandler({ ...t.deps, crm: () => throwingCrm })(payload),
    ).rejects.toBeInstanceOf(CrmUnavailableError);
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "crm.upsert.failed", actor: "system", at: TEST_NOW, detail: "CrmUnavailableError" },
    ]);
    expect(JSON.stringify(t.logs)).not.toContain("datos que no deben salir");
  });

  it("un lead que no cumple el esquema registra failed invalid_lead sin reintento", async () => {
    const t = setup({ [TEST_LEAD_ID]: { leadId: TEST_LEAD_ID } });
    await createCrmUpsertHandler({ ...t.deps, crm: () => new InMemoryCrmAdapter() })(payload);
    expect(t.events.map((e) => e.event.detail)).toEqual(["invalid_lead"]);
  });
});

describe("independencia de las tareas", () => {
  it("si crm.upsert falla, agency.notify se ejecuta igual y registra su evento", async () => {
    const t = setup();
    const { notified, resolution } = okNotifier();
    const crmTask = createCrmUpsertHandler({ ...t.deps, crm: () => throwingCrm });
    const notifyTask = createAgencyNotifyHandler({ ...t.deps, notifier: () => resolution });

    // Cada acción es su propia tarea en Cloud Tasks: se ejecutan por separado.
    const results = await Promise.allSettled([crmTask(payload), notifyTask(payload)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
    expect(notified).toEqual([TEST_LEAD_ID]);
    expect(t.types().sort()).toEqual(["agency.notify.succeeded", "crm.upsert.failed"]);

    // El reintento de Cloud Tasks vuelve a ejecutar solo crm.upsert.
    await createCrmUpsertHandler({ ...t.deps, crm: () => new InMemoryCrmAdapter() })(payload);
    expect(t.types()).toContain("crm.upsert.succeeded");
    expect(notified).toHaveLength(1);
  });
});

describe("agency.notify", () => {
  it("sin agency.notify: logger.warn sin datos personales, skipped no_channel y no lanza", async () => {
    const t = setup();
    await createAgencyNotifyHandler({ ...t.deps, notifier: () => ({ status: "no_channel" }) })(
      payload,
    );
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "agency.notify.skipped", actor: "system", at: TEST_NOW, detail: "no_channel" },
    ]);
    const warn = t.logs.filter((l) => l.level === "warn");
    expect(warn).toHaveLength(1);
    expect(warn[0]?.fields).toEqual({ action: "agency.notify", leadId: TEST_LEAD_ID });
    expect(JSON.stringify(t.logs)).not.toMatch(/Ficticia|example\.test/);
  });

  it("canal sin implementación: skipped not_implemented", async () => {
    const t = setup();
    await createAgencyNotifyHandler({
      ...t.deps,
      notifier: () => ({ status: "not_implemented", channel: "slack" }),
    })(payload);
    expect(t.events.map((e) => [e.event.type, e.event.detail])).toEqual([
      ["agency.notify.skipped", "not_implemented"],
    ]);
  });

  it("si el notifier lanza: failed y re-lanza", async () => {
    const t = setup();
    const notifier: Notifier = {
      notify: async () => {
        throw new TypeError("x");
      },
    };
    await expect(
      createAgencyNotifyHandler({
        ...t.deps,
        notifier: () => ({ status: "ready", channel: "email", notifier }),
      })(payload),
    ).rejects.toBeInstanceOf(TypeError);
    expect(t.events.map((e) => [e.event.type, e.event.detail])).toEqual([
      ["agency.notify.failed", "TypeError"],
    ]);
  });
});

describe("meta.capi.lead", () => {
  it("registra skipped not_implemented", async () => {
    const t = setup();
    await createMetaCapiLeadHandler(t.deps)(payload);
    expect(t.events.map((e) => [e.event.type, e.event.detail])).toEqual([
      ["meta.capi.lead.skipped", "not_implemented"],
    ]);
  });
});

describe("payload y lead ausente", () => {
  it.each([undefined, {}, { leadId: "no-ulid" }])(
    "payload inválido (%j): aviso sin evento y sin lanzar",
    async (bad) => {
      const t = setup();
      await createMetaCapiLeadHandler(t.deps)(bad);
      expect(t.events).toEqual([]);
      expect(t.logs.map((l) => l.level)).toEqual(["warn"]);
    },
  );

  it("lead que ya no existe: aviso sin evento y sin lanzar", async () => {
    const t = setup({});
    await createCrmUpsertHandler({ ...t.deps, crm: () => new InMemoryCrmAdapter() })(payload);
    expect(t.events).toEqual([]);
    expect(t.logs.map((l) => l.level)).toEqual(["warn"]);
  });
});
