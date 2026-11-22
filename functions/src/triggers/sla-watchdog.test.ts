import { describe, expect, it } from "vitest";
import type { ConfigSla, LeadEvent, SlaLevel } from "@tla/shared";
import type {
  NotifierResolution,
  NotifyMessage,
  NotifyRecipient,
} from "../integrations/notifier/index.js";
import { fakeLeadDoc } from "../tasks/fake-lead.js";
import {
  createSlaWatchdogHandler,
  fallbackSlaConfig,
  SlaWatchdogError,
  slaNotifySecrets,
  type SlaLogFields,
  type SlaWatchdogDeps,
} from "./sla-watchdog.js";
import type { SlaMarkRequest, SlaWatchdogStore } from "./sla-watchdog-store.js";

// Zona y horario de prueba; en runtime salen de `config/sla`.
const TZ = "Europe/Madrid"; // hardcoding-ok: valor de prueba
const SLA: ConfigSla = {
  warnAfterMinutes: 10,
  breachAfterMinutes: 30,
  businessHours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6] },
  timezone: TZ,
};

// Martes 15/01/2030 11:00 hora local (UTC+1).
const NOW = new Date("2030-01-15T10:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const LEAD_A = "01J0000000000000000000000A";
const LEAD_B = "01J0000000000000000000000B";

function lead(leadId: string, createdAt: Date, extra: Record<string, unknown> = {}) {
  return { ...fakeLeadDoc(leadId), createdAt, updatedAt: createdAt, ...extra };
}

interface Options {
  leads?: Record<string, Record<string, unknown>>;
  config?: unknown;
  channels?: Partial<Record<NotifyRecipient, "ready" | "no_channel" | "not_implemented">>;
  failNotify?: (message: NotifyMessage) => boolean;
  conflictOn?: (leadId: string, level: SlaLevel) => boolean;
}

function setup(options: Options = {}) {
  const leads = options.leads ?? {};
  const versions = new Map<string, number>(Object.keys(leads).map((id) => [id, 1]));
  const sent: { recipient: NotifyRecipient; message: NotifyMessage }[] = [];
  const marks: { leadId: string; mark: SlaMarkRequest }[] = [];
  const logs: { level: string; message: string; fields: SlaLogFields }[] = [];
  const queries: { createdFrom: Date; createdTo: Date; limit: number }[] = [];
  let config: unknown = options.config === undefined ? SLA : options.config;
  let seq = 0;

  const store: SlaWatchdogStore = {
    loadSlaConfig: async () => config,
    listCandidates: async (query) => {
      queries.push(query);
      return Object.entries(leads)
        .filter(([, data]) => data.status === "new")
        .filter(([, data]) => {
          const createdAt = data.createdAt as Date;
          return createdAt >= query.createdFrom && createdAt <= query.createdTo;
        })
        .map(([leadId, data]) => ({
          leadId,
          data: structuredClone(data),
          version: versions.get(leadId),
        }));
    },
    markLevel: async (leadId, version, mark) => {
      if (options.conflictOn?.(leadId, mark.level) === true || versions.get(leadId) !== version) {
        return { status: "conflict" };
      }
      const data = leads[leadId] as Record<string, unknown>;
      const field = mark.level === "warning" ? "warnedAt" : "breachedAt";
      data.sla = { ...(data.sla as object | undefined), [field]: mark.at };
      data.updatedAt = mark.at;
      const next = (versions.get(leadId) ?? 0) + 1;
      versions.set(leadId, next);
      marks.push({ leadId, mark });
      return { status: "marked", version: next };
    },
  };

  const notifier = (recipient: NotifyRecipient): NotifierResolution => {
    const status = options.channels?.[recipient] ?? "ready";
    if (status === "no_channel") return { status };
    if (status === "not_implemented") return { status, channel: "slack" };
    return {
      status: "ready",
      channel: "email",
      notifier: {
        notify: async (message) => {
          if (options.failNotify?.(message) === true) throw new TypeError("envío fallido");
          sent.push({ recipient, message });
          return { status: "sent" };
        },
      },
    };
  };

  const log = (level: string) => (message: string, fields: SlaLogFields) =>
    logs.push({ level, message, fields });
  const deps: SlaWatchdogDeps = {
    store,
    notifier,
    fallbackSla: () => SLA,
    now: () => NOW,
    newId: () => `evento-${++seq}`,
    log: { info: log("info"), warn: log("warn"), error: log("error") },
  };
  return {
    run: createSlaWatchdogHandler(deps),
    deps,
    leads,
    sent,
    marks,
    logs,
    queries,
    setConfig: (value: unknown) => {
      config = value;
    },
  };
}

const levelsSent = (sent: { recipient: NotifyRecipient; message: NotifyMessage }[]) =>
  sent.map(({ recipient, message }) => [
    recipient,
    message.kind === "sla" ? `${message.level}:${message.lead.leadId}` : message.kind,
  ]);

describe("slaWatchdog", () => {
  it("un lead new creado hace 11 minutos dentro del horario avisa al socio y marca sla.warnedAt", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(11)) } });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([["partner", `warning:${LEAD_A}`]]);
    expect(t.sent[0]?.message).toMatchObject({ businessMinutes: 11, thresholdMinutes: 10 });
    expect(t.leads[LEAD_A]?.sla).toEqual({ warnedAt: NOW });
    const event: LeadEvent = { type: "sla.warned", actor: "system", at: NOW };
    expect(t.marks.map(({ mark }) => mark.event)).toEqual([event]);
  });

  it("hace 31 minutos: aviso al socio, después a la agencia y sla.breachedAt", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31)) } });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([
      ["partner", `warning:${LEAD_A}`],
      ["agency", `breach:${LEAD_A}`],
    ]);
    expect(t.leads[LEAD_A]?.sla).toEqual({ warnedAt: NOW, breachedAt: NOW });
    expect(t.marks.map(({ mark }) => mark.event.type)).toEqual(["sla.warned", "sla.breached"]);
  });

  it("con sla.warnedAt previo solo queda el aviso a la agencia", async () => {
    const t = setup({
      leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31), { sla: { warnedAt: minutesAgo(20) } }) },
    });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([["agency", `breach:${LEAD_A}`]]);
  });

  it("antes del umbral no avisa; la consulta va de hace 14 días a hace warnAfterMinutes", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(9)) } });
    await t.run();
    expect(t.sent).toEqual([]);
    expect(t.queries).toEqual([
      {
        createdFrom: new Date(NOW.getTime() - 14 * 24 * 60 * 60_000),
        createdTo: minutesAgo(10),
        limit: 200,
      },
    ]);
  });

  it("tres ejecuciones seguidas: un solo aviso por lead y nivel", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31)) } });
    await t.run();
    await t.run();
    await t.run();
    expect(levelsSent(t.sent)).toEqual([
      ["partner", `warning:${LEAD_A}`],
      ["agency", `breach:${LEAD_A}`],
    ]);
  });

  it("fuera de horario mide desde la apertura siguiente en la zona del mercado", async () => {
    // Creado el lunes 14/01 a las 22:10 locales; a las 09:09 del martes: 9 minutos hábiles.
    const createdAt = new Date("2030-01-14T21:10:00Z");
    const early = setup({ leads: { [LEAD_A]: lead(LEAD_A, createdAt) } });
    early.deps.now = () => new Date("2030-01-15T08:09:00Z");
    await createSlaWatchdogHandler(early.deps)();
    expect(early.sent).toEqual([]);

    const onTime = setup({ leads: { [LEAD_A]: lead(LEAD_A, createdAt) } });
    onTime.deps.now = () => new Date("2030-01-15T08:10:00Z");
    await createSlaWatchdogHandler(onTime.deps)();
    expect(levelsSent(onTime.sent)).toEqual([["partner", `warning:${LEAD_A}`]]);
    expect(onTime.sent[0]?.message).toMatchObject({ businessMinutes: 10 });
  });

  it("cambiar config/sla cambia los umbrales en la ejecución siguiente", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(6)) } });
    await t.run();
    expect(t.sent).toEqual([]);
    t.setConfig({ ...SLA, warnAfterMinutes: 5, breachAfterMinutes: 6 });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([
      ["partner", `warning:${LEAD_A}`],
      ["agency", `breach:${LEAD_A}`],
    ]);
  });

  it.each([
    ["ausente", null],
    ["inválido", { warnAfterMinutes: "diez" }],
  ])("config/sla %s: usa la configuración resuelta y registra el error", async (_case, config) => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(11)) }, config });
    t.deps.fallbackSla = () => ({ ...SLA, warnAfterMinutes: 20, breachAfterMinutes: 40 });
    await createSlaWatchdogHandler(t.deps)();
    expect(t.sent).toEqual([]);
    expect(t.logs).toContainEqual({
      level: "error",
      message: "slaWatchdog: config/sla ausente o inválido",
      fields: { detail: "config_sla_fallback" },
    });
  });

  it("sin partner.notify: warning se omite con aviso en logs y se marca; breach se envía", async () => {
    const t = setup({
      leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31)) },
      channels: { partner: "no_channel" },
    });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([["agency", `breach:${LEAD_A}`]]);
    expect(t.marks.map(({ mark }) => mark.event)).toEqual([
      { type: "sla.warned", actor: "system", at: NOW, detail: "no_channel" },
      { type: "sla.breached", actor: "system", at: NOW },
    ]);
    expect(t.logs).toContainEqual({
      level: "warn",
      message: "slaWatchdog: aviso omitido",
      fields: {
        leadId: LEAD_A,
        level: "warning",
        outcome: "skipped",
        detail: "no_channel",
        businessMinutes: 31,
        thresholdMinutes: 10,
      },
    });
  });

  it("canal sin implementación: el nivel se omite con not_implemented", async () => {
    const t = setup({
      leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(11)) },
      channels: { partner: "not_implemented" },
    });
    await t.run();
    expect(t.marks.map(({ mark }) => mark.event.detail)).toEqual(["not_implemented"]);
  });

  it("si falla el aviso no marca el lead, sigue con los demás y la ejecución termina con error", async () => {
    const t = setup({
      leads: {
        [LEAD_A]: lead(LEAD_A, minutesAgo(31)),
        [LEAD_B]: lead(LEAD_B, minutesAgo(11)),
      },
      failNotify: (message) => message.kind === "sla" && message.lead.leadId === LEAD_A,
    });
    await expect(t.run()).rejects.toBeInstanceOf(SlaWatchdogError);
    expect(t.leads[LEAD_A]?.sla).toBeUndefined();
    expect(levelsSent(t.sent)).toEqual([["partner", `warning:${LEAD_B}`]]);
    expect(t.logs).toContainEqual({
      level: "error",
      message: "slaWatchdog: error con un lead",
      fields: { leadId: LEAD_A, outcome: "failed", detail: "TypeError" },
    });
  });

  it("si el lead cambió desde la lectura, no marca y deja el resto de niveles para la siguiente", async () => {
    const t = setup({
      leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31)) },
      conflictOn: (_id, level) => level === "warning",
    });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([["partner", `warning:${LEAD_A}`]]);
    expect(t.marks).toEqual([]);
    expect(t.logs.some((entry) => entry.fields.outcome === "conflict")).toBe(true);
  });

  it("con primera respuesta o fuera de new no avisa", async () => {
    const t = setup({
      leads: {
        [LEAD_A]: lead(LEAD_A, minutesAgo(31), { sla: { firstResponseAt: minutesAgo(25) } }),
        [LEAD_B]: lead(LEAD_B, minutesAgo(31), { status: "contacted" }),
      },
    });
    await t.run();
    expect(t.sent).toEqual([]);
  });

  it("un lead inválido se registra y no detiene a los demás ni hace fallar la ejecución", async () => {
    const t = setup({
      leads: {
        [LEAD_A]: { status: "new", createdAt: minutesAgo(31) },
        [LEAD_B]: lead(LEAD_B, minutesAgo(11)),
      },
    });
    await t.run();
    expect(levelsSent(t.sent)).toEqual([["partner", `warning:${LEAD_B}`]]);
    expect(t.logs).toContainEqual({
      level: "error",
      message: "slaWatchdog: lead inválido",
      fields: { leadId: LEAD_A, outcome: "failed", detail: "invalid_lead" },
    });
  });

  it("los logs y los eventos no llevan datos de contacto", async () => {
    const t = setup({
      leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(31)) },
      channels: { partner: "no_channel" },
    });
    await t.run();
    const recorded = JSON.stringify({
      logs: t.logs,
      events: t.marks.map(({ mark }) => mark.event),
    });
    expect(recorded).not.toContain("Persona Ficticia");
    expect(recorded).not.toContain("qa@example.test");
  });

  it("el aviso solo lleva leadId, origen y nombre", async () => {
    const t = setup({ leads: { [LEAD_A]: lead(LEAD_A, minutesAgo(11)) } });
    await t.run();
    expect(t.sent[0]?.message).toEqual({
      kind: "sla",
      level: "warning",
      lead: { leadId: LEAD_A, source: "landing", contact: { name: "Persona Ficticia" } },
      businessMinutes: 11,
      thresholdMinutes: 10,
    });
  });
});

describe("fallbackSlaConfig", () => {
  it("toma umbrales de sla y horario y zona del mercado", () => {
    expect(
      fallbackSlaConfig({
        agency: {},
        market: { locale: "es-XX", businessHours: SLA.businessHours, timezone: TZ }, // hardcoding-ok: valor de prueba
        channels: {},
        sla: { warnAfterMinutes: 10, breachAfterMinutes: 30 },
      }),
    ).toEqual(SLA);
  });
});

describe("slaNotifySecrets", () => {
  const email = (target: string) => ({ channel: "email" as const, target });
  const fake = (name: string) =>
    ({ name }) as unknown as ReturnType<typeof slaNotifySecrets>["agency"] & object;

  it("ata el secreto de cada aviso por email y reutiliza el mismo si coinciden", () => {
    const defined: string[] = [];
    const define = (name: string) => {
      defined.push(name);
      return fake(name);
    };
    const secrets = slaNotifySecrets(
      {
        agency: { notify: email("secret:AGENCY_NOTIFY_TARGET") },
        partner: { notify: email("secret:AGENCY_NOTIFY_TARGET") },
        market: { locale: "es-XX" }, // hardcoding-ok: valor de prueba
        channels: {},
      },
      define,
    );
    expect(defined).toEqual(["AGENCY_NOTIFY_TARGET"]);
    expect(secrets.agency).toBe(secrets.partner);
  });

  it("sin aviso o con otro canal no ata secretos", () => {
    const defined: string[] = [];
    const secrets = slaNotifySecrets(
      {
        agency: { notify: { channel: "slack", target: "secret:AGENCY_SLACK" } },
        market: { locale: "es-XX" }, // hardcoding-ok: valor de prueba
        channels: {},
      },
      (name) => {
        defined.push(name);
        return fake(name);
      },
    );
    expect(defined).toEqual([]);
    expect(secrets).toEqual({ agency: undefined, partner: undefined });
  });
});
