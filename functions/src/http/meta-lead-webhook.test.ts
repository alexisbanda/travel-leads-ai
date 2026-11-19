import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createMetaLeadWebhookHandler,
  INBOX_TTL_MS,
  type MetaInboxDoc,
  type WebhookRequest,
  type WebhookResponse,
} from "./meta-lead-webhook.js";

/** Región sintética: no corresponde a ninguna región real. */
const FAKE_REGION = "region-sintetica";
vi.mock("../config.js", () => ({
  loadInstanceConfig: () => ({
    infra: { region: FAKE_REGION },
    agency: {},
    channels: { meta: { pageTokenSecret: "secret:META_PAGE_ACCESS_TOKEN" } },
  }),
}));

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
const NOW = new Date("2030-01-01T00:00:00.000Z");

function fixture(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)));
}

function sign(body: Buffer, secret = APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function setup(overrides: { save?: () => Promise<"created" | "exists"> } = {}) {
  const inbox = new Map<string, MetaInboxDoc>();
  const saveInboxIfAbsent = vi.fn(async (id: string, doc: MetaInboxDoc) => {
    if (overrides.save) return overrides.save();
    if (inbox.has(id)) return "exists" as const;
    inbox.set(id, doc);
    return "created" as const;
  });
  const logError = vi.fn();
  const handler = createMetaLeadWebhookHandler({
    verifyToken: () => VERIFY_TOKEN,
    appSecret: () => APP_SECRET,
    saveInboxIfAbsent,
    now: () => NOW,
    logError,
  });
  return { inbox, saveInboxIfAbsent, logError, handler };
}

interface FakeResponse extends WebhookResponse {
  statusCode?: number;
  body?: string;
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
    send(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function fakeReq(init: {
  method: string;
  query?: Record<string, unknown>;
  rawBody?: Buffer;
  headers?: Record<string, string>;
}): WebhookRequest {
  const headers = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method: init.method,
    query: init.query ?? {},
    rawBody: init.rawBody,
    get: (name) => headers[name.toLowerCase()],
  };
}

function signedPost(body: Buffer, signature = sign(body)): WebhookRequest {
  return fakeReq({
    method: "POST",
    rawBody: body,
    headers: { "X-Hub-Signature-256": signature },
  });
}

describe("metaLeadWebhook · GET de verificación", () => {
  const query = (token: string) => ({
    "hub.mode": "subscribe",
    "hub.verify_token": token,
    "hub.challenge": "123",
  });

  it("responde 200 con el challenge en texto plano si el token coincide", async () => {
    const { handler } = setup();
    const res = fakeRes();
    await handler(fakeReq({ method: "GET", query: query(VERIFY_TOKEN) }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("123");
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
  });

  it("responde 403 si el token no coincide", async () => {
    const { handler } = setup();
    const res = fakeRes();
    await handler(fakeReq({ method: "GET", query: query("token-incorrecto") }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("123");
  });

  it("responde 403 si hub.mode no es subscribe o falta el challenge", async () => {
    const { handler } = setup();
    const res1 = fakeRes();
    await handler(
      fakeReq({ method: "GET", query: { ...query(VERIFY_TOKEN), "hub.mode": "unsubscribe" } }),
      res1,
    );
    expect(res1.statusCode).toBe(403);
    const res2 = fakeRes();
    await handler(
      fakeReq({
        method: "GET",
        query: { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN },
      }),
      res2,
    );
    expect(res2.statusCode).toBe(403);
  });
});

describe("metaLeadWebhook · POST", () => {
  const delivery = fixture("meta-leadgen-delivery.json");

  it("responde 401 sin escribir si falta la firma", async () => {
    const { handler, saveInboxIfAbsent, inbox } = setup();
    const res = fakeRes();
    await handler(fakeReq({ method: "POST", rawBody: delivery }), res);
    expect(res.statusCode).toBe(401);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
    expect(inbox.size).toBe(0);
  });

  it("responde 401 sin escribir si la firma es inválida", async () => {
    const { handler, saveInboxIfAbsent, inbox } = setup();
    const res = fakeRes();
    await handler(signedPost(delivery, sign(delivery, "otro-secreto")), res);
    expect(res.statusCode).toBe(401);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
    expect(inbox.size).toBe(0);
  });

  it("responde 401 sin escribir si no hay cuerpo crudo", async () => {
    const { handler, saveInboxIfAbsent } = setup();
    const res = fakeRes();
    await handler(
      fakeReq({ method: "POST", headers: { "X-Hub-Signature-256": sign(delivery) } }),
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
  });

  it("guarda inbox/meta_{leadgen_id} y no duplica al repetir la entrega", async () => {
    const { handler, inbox, saveInboxIfAbsent } = setup();
    const res1 = fakeRes();
    const res2 = fakeRes();
    await handler(signedPost(delivery), res1);
    await handler(signedPost(delivery), res2);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(saveInboxIfAbsent).toHaveBeenCalledTimes(2);
    expect([...inbox.keys()]).toEqual(["meta_000000000000001"]);

    const doc = inbox.get("meta_000000000000001");
    const parsed = JSON.parse(delivery.toString("utf8"));
    expect(doc).toEqual({
      source: "meta",
      payload: parsed.entry[0].changes[0].value,
      receivedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    expect(INBOX_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("guarda un documento por cada leadgen_id de la entrega", async () => {
    const { handler, inbox } = setup();
    const res = fakeRes();
    await handler(signedPost(fixture("meta-leadgen-delivery-two-leads.json")), res);
    expect(res.statusCode).toBe(200);
    expect([...inbox.keys()]).toEqual(["meta_000000000000002", "meta_000000000000003"]);
  });

  it("responde 200 sin escribir si la entrega no trae leadgen", async () => {
    const { handler, saveInboxIfAbsent } = setup();
    const body = Buffer.from(JSON.stringify({ object: "page", entry: [] }));
    const res = fakeRes();
    await handler(signedPost(body), res);
    expect(res.statusCode).toBe(200);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
  });

  it("responde 400 si el JSON es inválido aunque la firma sea válida", async () => {
    const { handler, saveInboxIfAbsent } = setup();
    const body = Buffer.from("{no es json");
    const res = fakeRes();
    await handler(signedPost(body), res);
    expect(res.statusCode).toBe(400);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
  });

  it("responde 500 para que Meta reintente si falla la escritura", async () => {
    const { handler, logError } = setup({
      save: () => Promise.reject(new Error("unavailable")),
    });
    const res = fakeRes();
    await handler(signedPost(delivery), res);
    expect(res.statusCode).toBe(500);
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe("metaLeadWebhook · otros métodos", () => {
  it.each(["PUT", "DELETE", "PATCH"])("responde 405 a %s", async (method) => {
    const { handler, saveInboxIfAbsent } = setup();
    const res = fakeRes();
    await handler(fakeReq({ method }), res);
    expect(res.statusCode).toBe(405);
    expect(saveInboxIfAbsent).not.toHaveBeenCalled();
  });
});

describe("index · metaLeadWebhook", () => {
  it("se exporta con la región de la instancia y los dos secretos", async () => {
    vi.resetModules();
    const { metaLeadWebhook } = await import("../index.js");
    const endpoint = (
      metaLeadWebhook as unknown as {
        __endpoint: { region?: unknown; secretEnvironmentVariables?: { key: string }[] };
      }
    ).__endpoint;
    expect(endpoint.region).toEqual([FAKE_REGION]);
    expect(endpoint.secretEnvironmentVariables?.map((s) => s.key).sort()).toEqual([
      "META_APP_SECRET",
      "META_VERIFY_TOKEN",
    ]);
  });
});
