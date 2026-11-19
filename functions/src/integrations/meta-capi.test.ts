import { describe, expect, it, vi } from "vitest";
import type { CapiLeadEvent } from "../domain/capi-lead-event.js";
import { MetaCapiError, sendCapiEvents } from "./meta-capi.js";
import { META_GRAPH_API_VERSION } from "./meta-graph-api.js";

const TOKEN = "token-capi-de-prueba";
const PIXEL_ID = "000000000000002";
const EMAIL_HASH = "603ba7ede2fef2a532e27f0bfcd60efbe67c1a0494f8756635779f4d8b56da7b";

const EVENT: CapiLeadEvent = {
  event_name: "Lead",
  event_id: "evt-ficticio-1",
  event_time: 1894701600,
  action_source: "website",
  user_data: { em: [EMAIL_HASH], fbp: "fb.1.1.123" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function send(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return sendCapiEvents(
    { pixelId: PIXEL_ID, accessToken: TOKEN, fetch: fetchImpl, env: {}, ...extra },
    [EVENT],
  );
}

async function caught(promise: Promise<unknown>): Promise<MetaCapiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MetaCapiError);
  return error as MetaCapiError;
}

describe("sendCapiEvents", () => {
  it("POST a /{version}/{pixelId}/events con { data } y el token en la cabecera, nunca en la URL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ events_received: 1 }));
    await expect(send(fetchMock)).resolves.toBe(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${PIXEL_ID}/events`);
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ data: [EVENT] });
    expect(String(init?.body)).not.toContain(TOKEN);
  });

  it("envía test_event_code solo si no está vacío", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ events_received: 1 }));
    await send(fetchMock, { testEventCode: "TEST123" });
    await send(fetchMock, { testEventCode: "" });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toEqual({ data: [EVENT], test_event_code: "TEST123" });
    expect(bodies[1]).not.toHaveProperty("test_event_code");
  });

  it("en el emulador respeta META_GRAPH_API_BASE_URL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ events_received: 1 }));
    await send(fetchMock, {
      env: { FUNCTIONS_EMULATOR: "true", META_GRAPH_API_BASE_URL: "http://127.0.0.1:9999/" },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `http://127.0.0.1:9999/${META_GRAPH_API_VERSION}/${PIXEL_ID}/events`,
    );
  });

  it("un 400 lanza MetaCapiError definitivo con status, code, subcode y fbtrace_id, sin el cuerpo", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: {
            message: `Invalid parameter ${EMAIL_HASH} qa@example.test`,
            type: "OAuthException",
            code: 100,
            error_subcode: 2804003,
            fbtrace_id: "AbCdEf123_-",
          },
        },
        400,
      ),
    );
    const error = await caught(send(fetchMock));
    expect(error).toMatchObject({
      kind: "status",
      status: 400,
      code: 100,
      subcode: 2804003,
      fbtraceId: "AbCdEf123_-",
      detail: "meta_capi_400",
      transient: false,
    });
    const serialized = JSON.stringify({ ...error, message: error.message });
    expect(serialized).not.toContain(EMAIL_HASH);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("Invalid parameter");
  });

  it.each([500, 503, 429])("un %i es transitorio", async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, status));
    const error = await caught(send(fetchMock));
    expect(error).toMatchObject({ status, transient: true, detail: `meta_capi_${status}` });
    expect(error.code).toBeUndefined();
  });

  it("un error sin cuerpo JSON conserva el status", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 403 }));
    const error = await caught(send(fetchMock));
    expect(error).toMatchObject({ status: 403, transient: false });
  });

  it("un error de red es transitorio", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed ${TOKEN}`);
    });
    const error = await caught(send(fetchMock));
    expect(error).toMatchObject({ kind: "network", detail: "meta_capi_network", transient: true });
    expect(error.message).not.toContain(TOKEN);
  });

  it("el timeout es transitorio", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const error = await caught(send(fetchMock, { timeoutMs: 5 }));
    expect(error).toMatchObject({ kind: "timeout", detail: "meta_capi_timeout", transient: true });
  });

  it("un 200 sin events_received es una respuesta inválida", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const error = await caught(send(fetchMock));
    expect(error).toMatchObject({ kind: "invalid_response", transient: false });
  });

  it("rechaza un pixelId que no son dígitos sin llamar a Meta", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(send(fetchMock, { pixelId: "../me" })).rejects.toThrow("pixelId inválido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
