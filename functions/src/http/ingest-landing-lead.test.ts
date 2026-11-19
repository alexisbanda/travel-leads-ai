import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Consent, Lead, LeadEvent, Ulid } from "@tla/shared";
import { describe, expect, it, vi } from "vitest";
import { hashIp, isReengageable, type DedupeEntry } from "../domain/landing-lead.js";
import { ulid } from "../domain/ulid.js";
import type {
  IngestOutcome,
  IngestTransactionRequest,
} from "../integrations/landing-lead-store.js";
import {
  APP_CHECK_EMULATOR_TOKEN_ENV,
  APP_CHECK_HEADER,
  createAppCheckVerifier,
  createIngestLandingLeadHandler,
  type IngestLandingLeadDeps,
  type IngestRequest,
  type IngestResponse,
} from "./ingest-landing-lead.js";

// Valores ficticios de prueba: en runtime salen de la configuración resuelta.
const SETTINGS = {
  phoneDefaultRegion: "ES",
  marketCountry: "ES",
  locale: "es-ES", // hardcoding-ok: valor de prueba
  dataRetentionMonths: 24,
};
const PHONE_E164 = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
const IP = "192.0.2.10"; // TEST-NET-1 (RFC 5737)
const SALT = "salt-de-prueba";
const VALID_TOKEN = "app-check-valido";
const NOW = new Date("2030-01-15T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Datos personales del fixture que nunca pueden aparecer en los logs. */
const PII = ["Prueba", "600 00 00 00", "600000000", "prueba.qa@example.com", IP];

function fixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../test/fixtures/landing-lead-valid.json", import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

/** Firestore en memoria con la misma decisión que `runIngestTransaction`. */
function memoryStore() {
  const leads = new Map<string, Lead>();
  const consents = new Map<string, Consent>();
  const dedupe = new Map<string, DedupeEntry>();
  const events = new Map<string, Map<string, LeadEvent>>();
  const requests: IngestTransactionRequest[] = [];
  const addEvent = (leadId: string, eventId: string, event: LeadEvent) => {
    const list = events.get(leadId) ?? new Map<string, LeadEvent>();
    list.set(eventId, event);
    events.set(leadId, list);
  };
  async function run(request: IngestTransactionRequest): Promise<IngestOutcome> {
    requests.push(request);
    const entry = dedupe.get(request.dedupeKey);
    const existing = entry ? leads.get(entry.leadId) : undefined;
    if (existing && isReengageable(existing, request.now)) {
      addEvent(existing.leadId, request.reengaged.eventId, request.reengaged.event);
      return { leadId: existing.leadId, deduplicated: true };
    }
    const { newLead } = request;
    leads.set(newLead.leadId, structuredClone(newLead.lead));
    consents.set(newLead.consentId, newLead.consent);
    dedupe.set(request.dedupeKey, newLead.dedupe);
    addEvent(newLead.leadId, newLead.eventId, newLead.event);
    return { leadId: newLead.leadId, deduplicated: false };
  }
  const writes = () =>
    leads.size +
    consents.size +
    dedupe.size +
    [...events.values()].reduce((sum, list) => sum + list.size, 0);
  return { leads, consents, dedupe, events, requests, run, writes };
}

function setup(overrides: Partial<IngestLandingLeadDeps> = {}) {
  const store = memoryStore();
  const clock = { now: NOW };
  const logs: { level: string; message: string; fields: unknown }[] = [];
  const log = {
    info: vi.fn((message: string, fields?: unknown) =>
      logs.push({ level: "info", message, fields }),
    ),
    warn: vi.fn((message: string, fields?: unknown) =>
      logs.push({ level: "warn", message, fields }),
    ),
    error: vi.fn((message: string, fields?: unknown) =>
      logs.push({ level: "error", message, fields }),
    ),
  };
  const deps: IngestLandingLeadDeps = {
    settings: () => SETTINGS,
    verifyAppCheck: vi.fn(async (token: string) => token === VALID_TOKEN),
    ipHashSalt: () => SALT,
    newId: () => ulid(clock.now.getTime()),
    now: () => clock.now,
    runIngestTransaction: vi.fn(store.run),
    log,
    ...overrides,
  };
  return { store, clock, logs, log, deps, handler: createIngestLandingLeadHandler(deps) };
}

interface FakeResponse extends IngestResponse {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
}

function fakeRes(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(field, value) {
      res.headers[field.toLowerCase()] = value;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function req(
  body: unknown = fixture(),
  options: { method?: string; token?: string | null; ip?: string } = {},
): IngestRequest {
  const headers: Record<string, string> = { "user-agent": "agente-de-prueba" };
  if (options.token !== null)
    headers[APP_CHECK_HEADER.toLowerCase()] = options.token ?? VALID_TOKEN;
  return {
    method: options.method ?? "POST",
    body,
    ip: options.ip ?? IP,
    get: (name) => headers[name.toLowerCase()],
  };
}

async function send(handler: ReturnType<typeof setup>["handler"], request = req()) {
  const res = fakeRes();
  await handler(request, res);
  return res;
}

describe("ingestLandingLead · lead nuevo", () => {
  it("200 y escribe lead, consentimiento, dedupe y evento created en una transacción", async () => {
    const { handler, store, deps } = setup();
    const res = await send(handler);

    expect(res.statusCode).toBe(200);
    const body = res.body as { leadId: string; deduplicated: boolean };
    expect(body.deduplicated).toBe(false);
    expect(Ulid.safeParse(body.leadId).success).toBe(true);
    expect(deps.runIngestTransaction).toHaveBeenCalledTimes(1);

    const lead = store.leads.get(body.leadId);
    expect(Lead.safeParse(lead).success).toBe(true);
    expect(lead?.contact.phoneE164).toBe(PHONE_E164);
    expect(lead?.contact.email).toBe("prueba.qa@example.com");
    expect(lead?.retentionUntil.toISOString()).toBe("2032-01-15T10:00:00.000Z");

    const consent = store.consents.get(lead?.consentId ?? "");
    expect(Consent.safeParse(consent).success).toBe(true);
    expect(consent?.ipHash).toBe(hashIp(IP, SALT));
    expect(JSON.stringify([...store.consents.values(), ...store.leads.values()])).not.toContain(IP);

    expect(store.dedupe.get(lead?.dedupeKey ?? "")).toEqual({
      leadId: body.leadId,
      createdAt: NOW,
    });
    expect([...(store.events.get(body.leadId)?.values() ?? [])]).toEqual([
      { type: "created", actor: "system", at: NOW },
    ]);
  });

  it("acepta un envío sin atribución (visita directa)", async () => {
    const { handler, store } = setup();
    const withoutAttribution = fixture();
    delete withoutAttribution.attribution;
    const res = await send(handler, req(withoutAttribution));
    expect(res.statusCode).toBe(200);
    const lead = [...store.leads.values()][0];
    expect(lead?.attribution).toEqual({ landingSlug: "landing-qa-1", firstTouchAt: NOW });
  });

  it("405 con un método que no es POST", async () => {
    const { handler, store } = setup();
    const res = await send(handler, req(undefined, { method: "GET" }));
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("POST");
    expect(store.writes()).toBe(0);
  });
});

describe("ingestLandingLead · App Check", () => {
  it("401 sin cabecera y sin escribir", async () => {
    const { handler, store, deps } = setup();
    const res = await send(handler, req(fixture(), { token: null }));
    expect(res.statusCode).toBe(401);
    expect(deps.verifyAppCheck).not.toHaveBeenCalled();
    expect(deps.runIngestTransaction).not.toHaveBeenCalled();
    expect(store.writes()).toBe(0);
  });

  it("401 con token rechazado y sin escribir", async () => {
    const { handler, store, deps } = setup();
    const res = await send(handler, req(fixture(), { token: "token-falso" }));
    expect(res.statusCode).toBe(401);
    expect(deps.runIngestTransaction).not.toHaveBeenCalled();
    expect(store.writes()).toBe(0);
  });

  it("401 antes de mirar el honeypot", async () => {
    const { handler, store } = setup();
    const res = await send(handler, req({ ...fixture(), website: "x" }, { token: null }));
    expect(res.statusCode).toBe(401);
    expect(store.writes()).toBe(0);
  });
});

describe("createAppCheckVerifier", () => {
  const DEBUG_TOKEN = "token-depuracion-emulador";
  const rejectAll = vi.fn(async () => {
    throw new Error("token de App Check no válido");
  });

  it("acepta un token que verifica App Check", async () => {
    const verify = createAppCheckVerifier({
      verifyToken: async () => ({ appId: "app" }),
      env: {},
    });
    expect(await verify("cualquiera")).toBe(true);
  });

  it("en el emulador acepta el token de depuración del env y rechaza otro", async () => {
    const verify = createAppCheckVerifier({
      verifyToken: rejectAll,
      env: { FUNCTIONS_EMULATOR: "true", [APP_CHECK_EMULATOR_TOKEN_ENV]: DEBUG_TOKEN },
    });
    expect(await verify(DEBUG_TOKEN)).toBe(true);
    expect(await verify("otro-token")).toBe(false);
  });

  it.each([{}, { FUNCTIONS_EMULATOR: "false" }, { FUNCTIONS_EMULATOR: "1" }])(
    "fuera del emulador (%o) el token de depuración da 401",
    async (env) => {
      const verifyAppCheck = createAppCheckVerifier({
        verifyToken: rejectAll,
        env: { ...env, [APP_CHECK_EMULATOR_TOKEN_ENV]: DEBUG_TOKEN },
      });
      const { handler, store } = setup({ verifyAppCheck });
      const res = await send(handler, req(fixture(), { token: DEBUG_TOKEN }));
      expect(res.statusCode).toBe(401);
      expect(store.writes()).toBe(0);
    },
  );

  it("en el emulador sin token de depuración en el env, decide verifyToken (rechazo → 401)", async () => {
    const verifyToken = vi.fn(async () => {
      throw new Error("token de App Check no válido");
    });
    const verifyAppCheck = createAppCheckVerifier({
      verifyToken,
      env: { FUNCTIONS_EMULATOR: "true" },
    });
    const { handler, store } = setup({ verifyAppCheck });
    const res = await send(handler, req(fixture(), { token: "token-cualquiera" }));
    expect(verifyToken).toHaveBeenCalledWith("token-cualquiera");
    expect(res.statusCode).toBe(401);
    expect(store.writes()).toBe(0);
  });

  it("en el emulador, con el token de depuración vacío en el env, no acepta nada", async () => {
    const verify = createAppCheckVerifier({
      verifyToken: rejectAll,
      env: { FUNCTIONS_EMULATOR: "true", [APP_CHECK_EMULATOR_TOKEN_ENV]: "" },
    });
    expect(await verify("")).toBe(false);
    expect(await verify(DEBUG_TOKEN)).toBe(false);
  });
});

describe("ingestLandingLead · honeypot", () => {
  it("200 con leadId falso, sin escrituras y log spam_blocked", async () => {
    const { handler, store, deps, logs } = setup();
    const res = await send(handler, req({ ...fixture(), website: "x" }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { leadId: string; deduplicated: boolean };
    expect(body.deduplicated).toBe(false);
    expect(Ulid.safeParse(body.leadId).success).toBe(true);
    expect(deps.runIngestTransaction).not.toHaveBeenCalled();
    expect(store.writes()).toBe(0);
    expect(logs).toEqual([
      {
        level: "info",
        message: "ingestLandingLead: spam_blocked",
        fields: { landingSlug: "landing-qa-1" },
      },
    ]);
  });
});

describe("ingestLandingLead · validación", () => {
  async function expect400(body: unknown, fields: string[]) {
    const { handler, store, deps } = setup();
    const res = await send(handler, req(body));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "validation", fields });
    expect(deps.runIngestTransaction).not.toHaveBeenCalled();
    expect(store.writes()).toBe(0);
  }

  it("400 sin consent.contact", async () => {
    await expect400({ ...fixture(), consent: { marketing: true, textVersion: "1.0.0" } }, [
      "consent.contact",
    ]);
  });

  it("400 con consent.contact a false", async () => {
    await expect400({ ...fixture(), consent: { contact: false, textVersion: "1.0.0" } }, [
      "consent.contact",
    ]);
  });

  it("400 con teléfono no válido", async () => {
    await expect400({ ...fixture(), phone: "000000" }, ["phone"]);
  });

  it("400 con textVersion que no es una versión", async () => {
    await expect400({ ...fixture(), consent: { contact: true, textVersion: "versión 1" } }, [
      "consent.textVersion",
    ]);
  });

  it("400 con varios campos y con un cuerpo que no es objeto", async () => {
    await expect400({ ...fixture(), name: "", email: "no-es-email" }, ["name", "email"]);
    await expect400("texto", ["body"]);
    await expect400(null, ["body"]);
  });
});

describe("ingestLandingLead · deduplicación", () => {
  const otherSubmission = () => ({
    ...fixture(),
    landingSlug: "otra-landing",
    attribution: { utmSource: "newsletter", eventId: "evento-de-prueba-2" },
  });

  it("doble clic: mismo leadId y deduplicated true", async () => {
    const { handler, store } = setup();
    const first = (await send(handler)).body as { leadId: string };
    const second = await send(handler);
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ leadId: first.leadId, deduplicated: true });
    expect(store.leads.size).toBe(1);
    expect(store.consents.size).toBe(1);
    expect(store.dedupe.size).toBe(1);
  });

  it("lead abierto de hace 30 días: evento reengaged con la nueva atribución", async () => {
    const { handler, store, clock } = setup();
    clock.now = new Date(NOW.getTime() - 30 * DAY_MS);
    const first = (await send(handler)).body as { leadId: string };
    const original = structuredClone(store.leads.get(first.leadId));

    clock.now = NOW;
    const res = await send(handler, req(otherSubmission()));
    expect(res.body).toEqual({ leadId: first.leadId, deduplicated: true });
    expect(store.leads.size).toBe(1);
    expect(store.leads.get(first.leadId)?.attribution).toEqual(original?.attribution);

    const events = [...(store.events.get(first.leadId)?.values() ?? [])];
    expect(events.map((event) => event.type)).toEqual(["created", "reengaged"]);
    expect(events[1]).toEqual({
      type: "reengaged",
      actor: "system",
      at: NOW,
      attribution: {
        utmSource: "newsletter",
        eventId: "evento-de-prueba-2",
        landingSlug: "otra-landing",
      },
    });
    expect(LeadEvent.safeParse(events[1]).success).toBe(true);
  });

  it("lead anterior lost: crea un lead nuevo", async () => {
    const { handler, store } = setup();
    const first = (await send(handler)).body as { leadId: string };
    const lead = store.leads.get(first.leadId);
    if (lead) lead.status = "lost";
    const res = await send(handler, req(otherSubmission()));
    const body = res.body as { leadId: string; deduplicated: boolean };
    expect(body.deduplicated).toBe(false);
    expect(body.leadId).not.toBe(first.leadId);
    expect(store.leads.size).toBe(2);
    expect(store.dedupe.size).toBe(1);
    expect([...store.dedupe.values()][0]?.leadId).toBe(body.leadId);
  });

  it("lead de hace más de 90 días: crea un lead nuevo", async () => {
    const { handler, store, clock } = setup();
    clock.now = new Date(NOW.getTime() - 91 * DAY_MS);
    const first = (await send(handler)).body as { leadId: string };
    clock.now = NOW;
    const res = await send(handler, req(otherSubmission()));
    const body = res.body as { leadId: string; deduplicated: boolean };
    expect(body.deduplicated).toBe(false);
    expect(body.leadId).not.toBe(first.leadId);
    expect(store.leads.size).toBe(2);
  });
});

describe("ingestLandingLead · errores", () => {
  it("500 sin detalles si la transacción falla", async () => {
    const { handler } = setup({
      runIngestTransaction: async () => {
        throw new Error(`fallo al escribir Prueba QA ${PHONE_E164} ${IP}`);
      },
    });
    const res = await send(handler);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "internal" });
  });
});

describe("ingestLandingLead · logs sin datos personales", () => {
  it("en todos los caminos solo registra leadId, landingSlug, campos y nombre del error", async () => {
    const { handler, logs, store } = setup();
    await send(handler); // éxito
    await send(handler); // dedupe
    await send(handler, req({ ...fixture(), phone: "000000" })); // 400 teléfono
    await send(handler, req({ ...fixture(), consent: { textVersion: "1.0.0" } })); // 400 consent
    await send(handler, req(fixture(), { token: null })); // 401 sin token
    await send(handler, req(fixture(), { token: "token-falso" })); // 401 token rechazado
    await send(handler, req({ ...fixture(), website: "x" })); // honeypot

    const failing = setup({
      runIngestTransaction: async () => {
        throw new Error(`fallo al escribir Prueba QA ${PHONE_E164} ${IP}`);
      },
    });
    await send(failing.handler); // error

    const all = [...logs, ...failing.logs];
    expect(all.map((entry) => entry.message)).toEqual([
      "ingestLandingLead: lead_created",
      "ingestLandingLead: lead_reengaged",
      "ingestLandingLead: validation_failed",
      "ingestLandingLead: validation_failed",
      "ingestLandingLead: app_check_rejected",
      "ingestLandingLead: app_check_rejected",
      "ingestLandingLead: spam_blocked",
      "ingestLandingLead: unexpected_error",
    ]);
    const serialized = JSON.stringify(all);
    for (const value of [...PII, PHONE_E164, hashIp(IP, SALT)]) {
      expect(serialized.toLowerCase()).not.toContain(value.toLowerCase());
    }
    const allowed = new Set(["leadId", "landingSlug", "fields", "errorName"]);
    for (const entry of all) {
      for (const key of Object.keys((entry.fields ?? {}) as object)) expect(allowed).toContain(key);
    }
    const leadId = [...store.leads.keys()][0];
    expect(all[0]?.fields).toEqual({ leadId, landingSlug: "landing-qa-1" });
    expect(failing.logs[0]?.fields).toEqual({ landingSlug: "landing-qa-1", errorName: "Error" });
  });
});
