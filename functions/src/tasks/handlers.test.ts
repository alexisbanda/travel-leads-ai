import { describe, expect, it } from "vitest";
import type { LeadEvent } from "@tla/shared";
import type { CapiLeadEvent } from "../domain/capi-lead-event.js";
import { InMemoryCrmAdapter, type CrmAdapter } from "../integrations/crm/index.js";
import type {
  Notifier,
  NotifierResolution,
  NotifyMessage,
} from "../integrations/notifier/index.js";
import { MetaCapiError } from "../integrations/meta-capi.js";
import { fakeLeadDoc, TEST_LEAD_ID, TEST_NOW } from "./fake-lead.js";
import {
  createAgencyNotifyHandler,
  createCrmUpsertHandler,
  createMetaCapiLeadHandler,
  type LeadTaskDeps,
  type MetaCapiSender,
  type TaskLogFields,
} from "./handlers.js";
import type { LeadTaskStore } from "./lead-task-store.js";

class CrmUnavailableError extends Error {
  override name = "CrmUnavailableError";
}

/** Store en memoria con un lead ficticio. */
function setup(
  leads: Record<string, Record<string, unknown>> = { [TEST_LEAD_ID]: fakeLeadDoc() },
  consents: Record<string, Record<string, unknown>> = {},
) {
  const events: { leadId: string; event: LeadEvent }[] = [];
  const crmIds: Record<string, unknown> = {};
  const logs: { level: string; message: string; fields: TaskLogFields }[] = [];
  let seq = 0;
  const store: LeadTaskStore = {
    loadLead: async (leadId) => leads[leadId] ?? null,
    loadConsent: async (consentId) => consents[consentId] ?? null,
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
  const notifier: Notifier = {
    notify: async (message) => {
      notified.push(message.lead.leadId);
      return { status: "sent" };
    },
  };
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

  it("pasa al notifier un mensaje lead_created con los datos del lead", async () => {
    const t = setup();
    const messages: NotifyMessage[] = [];
    const notifier: Notifier = {
      notify: async (message) => {
        messages.push(message);
        return { status: "sent" };
      },
    };
    await createAgencyNotifyHandler({
      ...t.deps,
      notifier: () => ({ status: "ready", channel: "email", notifier }),
    })(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe("lead_created");
    expect(messages[0]?.lead.leadId).toBe(TEST_LEAD_ID);
    expect(t.types()).toEqual(["agency.notify.succeeded"]);
  });

  it("sin destinatarios: skipped no_recipients y aviso en logs sin datos personales", async () => {
    const t = setup();
    const notifier: Notifier = {
      notify: async () => ({ status: "skipped", reason: "no_recipients" }),
    };
    await createAgencyNotifyHandler({
      ...t.deps,
      notifier: () => ({ status: "ready", channel: "email", notifier }),
    })(payload);
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "agency.notify.skipped", actor: "system", at: TEST_NOW, detail: "no_recipients" },
    ]);
    const warn = t.logs.filter((l) => l.level === "warn");
    expect(warn).toHaveLength(1);
    expect(warn[0]?.fields).toEqual({
      action: "agency.notify",
      leadId: TEST_LEAD_ID,
      detail: "no_recipients",
    });
    expect(JSON.stringify(t.logs)).not.toMatch(/Ficticia|example\.test|@/);
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
  // Datos ficticios: nunca datos reales de leads (AGENTS.md).
  const PHONE = "+9900000001"; // hardcoding-ok: teléfono ficticio de prueba
  const EMAIL_HASH = "603ba7ede2fef2a532e27f0bfcd60efbe67c1a0494f8756635779f4d8b56da7b";
  const PHONE_HASH = "5f0ba9fa3f1122ef13b944a40abfe44e7eba9e16934e64200913cb4c402ace14";
  const TOKEN = "token-capi-de-prueba";

  function capiLead(attribution: Record<string, unknown> = { eventId: "evt-ficticio-1" }) {
    const doc = fakeLeadDoc();
    return {
      ...doc,
      contact: { ...(doc.contact as Record<string, unknown>), phoneE164: PHONE },
      attribution,
    };
  }
  const marketing = {
    "consent-ficticio": { purposes: ["contact", "marketing"], grantedAt: TEST_NOW },
  };

  function recordingCapi(result: () => Promise<number>) {
    const sent: CapiLeadEvent[][] = [];
    const capi: MetaCapiSender = async (events) => {
      sent.push(events);
      return result();
    };
    return { sent, capi: () => capi };
  }

  function piiFree(logs: unknown, events: unknown) {
    const text = JSON.stringify({ logs, events });
    for (const forbidden of [
      EMAIL_HASH,
      PHONE_HASH,
      TOKEN,
      "example.test",
      "9900000001",
      "Ficticia",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  }

  it("sin attribution.eventId: skipped no_event_id sin llamar a Meta", async () => {
    const t = setup({ [TEST_LEAD_ID]: capiLead({ fbp: "fb.1.1.123" }) }, marketing);
    const meta = recordingCapi(async () => 1);
    await createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload);
    expect(meta.sent).toEqual([]);
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "meta.capi.lead.skipped", actor: "system", at: TEST_NOW, detail: "no_event_id" },
    ]);
  });

  it("con consentimiento de marketing envía el evento con em/ph en SHA-256 y registra succeeded", async () => {
    const t = setup({ [TEST_LEAD_ID]: capiLead() }, marketing);
    const meta = recordingCapi(async () => 1);
    await createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload);
    expect(meta.sent).toEqual([
      [
        {
          event_name: "Lead",
          event_id: "evt-ficticio-1",
          event_time: Math.floor(TEST_NOW.getTime() / 1000),
          action_source: "website",
          user_data: { em: [EMAIL_HASH], ph: [PHONE_HASH] },
        },
      ],
    ]);
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "meta.capi.lead.succeeded", actor: "system", at: TEST_NOW },
    ]);
    piiFree(t.logs, t.events);
  });

  it("sin consentimiento de marketing (o sin documento de consentimiento) no envía em ni ph", async () => {
    const cases: Record<string, Record<string, unknown>>[] = [
      { "consent-ficticio": { purposes: ["contact"], grantedAt: TEST_NOW } },
      {},
    ];
    for (const consents of cases) {
      const t = setup(
        { [TEST_LEAD_ID]: capiLead({ eventId: "evt-ficticio-1", fbc: "fb.1.1.x" }) },
        consents,
      );
      const meta = recordingCapi(async () => 1);
      await createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload);
      expect(meta.sent[0]?.[0]?.user_data).toEqual({ fbc: "fb.1.1.x" });
      expect(t.types()).toEqual(["meta.capi.lead.succeeded"]);
    }
  });

  it.each([
    ["500", () => new MetaCapiError("status", { status: 500, fbtraceId: "Trace500" })],
    ["429", () => new MetaCapiError("status", { status: 429, code: 4 })],
    ["red", () => new MetaCapiError("network")],
    ["timeout", () => new MetaCapiError("timeout")],
  ])("un %s registra failed con el código y re-lanza para reintentar", async (_name, make) => {
    const t = setup({ [TEST_LEAD_ID]: capiLead() }, marketing);
    const error = make();
    const meta = recordingCapi(async () => {
      throw error;
    });
    await expect(createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload)).rejects.toBe(
      error,
    );
    expect(t.events.map((e) => [e.event.type, e.event.detail])).toEqual([
      ["meta.capi.lead.failed", error.detail],
    ]);
    const logged = t.logs.filter((l) => l.level === "error");
    expect(logged).toHaveLength(1);
    expect(logged[0]?.fields).toMatchObject({ action: "meta.capi.lead", leadId: TEST_LEAD_ID });
    if (error.status !== undefined) expect(logged[0]?.fields.status).toBe(error.status);
    piiFree(t.logs, t.events);
  });

  it("un 400 registra failed con status, code, subcode y fbtrace_id, sin re-lanzar", async () => {
    const t = setup({ [TEST_LEAD_ID]: capiLead() }, marketing);
    const meta = recordingCapi(async () => {
      throw new MetaCapiError("status", {
        status: 400,
        code: 100,
        subcode: 2804003,
        fbtraceId: "AbCdEf123",
      });
    });
    await createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload);
    expect(t.events.map((e) => e.event)).toEqual([
      { type: "meta.capi.lead.failed", actor: "system", at: TEST_NOW, detail: "meta_capi_400" },
    ]);
    expect(t.logs).toEqual([
      {
        level: "error",
        message: "lead task",
        fields: {
          action: "meta.capi.lead",
          leadId: TEST_LEAD_ID,
          outcome: "failed",
          detail: "meta_capi_400",
          status: 400,
          code: 100,
          subcode: 2804003,
          fbtrace_id: "AbCdEf123",
        },
      },
    ]);
    piiFree(t.logs, t.events);
  });

  it("un error inesperado (p. ej. el secreto) registra failed con su nombre y re-lanza", async () => {
    const t = setup({ [TEST_LEAD_ID]: capiLead() }, marketing);
    const capi = () => {
      throw new TypeError(`sin token ${TOKEN}`);
    };
    await expect(createMetaCapiLeadHandler({ ...t.deps, capi })(payload)).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(t.events.map((e) => e.event.detail)).toEqual(["TypeError"]);
    piiFree(t.logs, t.events);
  });

  it("un lead que no cumple el esquema registra failed invalid_lead sin reintento", async () => {
    const t = setup({ [TEST_LEAD_ID]: { leadId: TEST_LEAD_ID } });
    const meta = recordingCapi(async () => 1);
    await createMetaCapiLeadHandler({ ...t.deps, capi: meta.capi })(payload);
    expect(meta.sent).toEqual([]);
    expect(t.events.map((e) => e.event.detail)).toEqual(["invalid_lead"]);
  });
});

const unusedCapi = () => {
  throw new Error("no debe llamarse");
};

describe("payload y lead ausente", () => {
  it.each([undefined, {}, { leadId: "no-ulid" }])(
    "payload inválido (%j): aviso sin evento y sin lanzar",
    async (bad) => {
      const t = setup();
      await createMetaCapiLeadHandler({ ...t.deps, capi: unusedCapi })(bad);
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
