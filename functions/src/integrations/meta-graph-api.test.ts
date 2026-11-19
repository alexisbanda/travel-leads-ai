import { describe, expect, it, vi } from "vitest";
import {
  createMetaGraphApiClient,
  META_GRAPH_API_VERSION,
  MetaGraphApiError,
  metaGraphApiBaseUrl,
} from "./meta-graph-api.js";

const TOKEN = "token-de-prueba";

function client(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = {}, timeoutMs?: number) {
  return createMetaGraphApiClient({
    accessToken: () => TOKEN,
    fetch: fetchImpl,
    env,
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createMetaGraphApiClient.fetchLead", () => {
  it("pide el lead con los campos y el token en la cabecera, nunca en la URL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: "1", field_data: [] }));
    const body = await client(fetchMock).fetchLead("000000000000001");
    expect(body).toEqual({ id: "1", field_data: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/000000000000001?fields=field_data%2Ccreated_time%2Cad_id%2Cadset_id%2Ccampaign_id%2Cform_id`,
    );
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("un no-2xx lanza MetaGraphApiError con el status y sin el cuerpo", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: "dato-sensible" } }, 500),
    );
    const error = await client(fetchMock)
      .fetchLead("1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaGraphApiError);
    expect(error).toMatchObject({ kind: "status", status: 500, code: "graph_api_500" });
    expect(String((error as Error).message)).not.toContain("dato-sensible");
  });

  it("un fallo de red lanza graph_api_network", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client(fetchMock).fetchLead("1")).rejects.toMatchObject({
      code: "graph_api_network",
    });
  });

  it("el timeout aborta la petición y lanza graph_api_network", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(client(fetchMock, {}, 10).fetchLead("1")).rejects.toMatchObject({
      code: "graph_api_network",
    });
  });

  it("un cuerpo que no es JSON lanza graph_api_invalid_response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }));
    await expect(client(fetchMock).fetchLead("1")).rejects.toMatchObject({
      code: "graph_api_invalid_response",
    });
  });

  it("rechaza un leadgenId que no son dígitos sin llamar a la API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).fetchLead("../me")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("usa META_GRAPH_API_BASE_URL dentro del emulador", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await client(fetchMock, {
      FUNCTIONS_EMULATOR: "true",
      META_GRAPH_API_BASE_URL: "http://127.0.0.1:9999/",
    }).fetchLead("1");
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      new RegExp(`^http://127\\.0\\.0\\.1:9999/${META_GRAPH_API_VERSION}/1\\?`),
    );
  });
});

describe("metaGraphApiBaseUrl", () => {
  it("ignora META_GRAPH_API_BASE_URL fuera del emulador", () => {
    expect(metaGraphApiBaseUrl({ META_GRAPH_API_BASE_URL: "http://127.0.0.1:9999" })).toBe(
      "https://graph.facebook.com",
    );
    expect(
      metaGraphApiBaseUrl({
        FUNCTIONS_EMULATOR: "false",
        META_GRAPH_API_BASE_URL: "http://127.0.0.1:9999",
      }),
    ).toBe("https://graph.facebook.com");
  });

  it("sin la variable usa la URL de Meta también en el emulador", () => {
    expect(metaGraphApiBaseUrl({ FUNCTIONS_EMULATOR: "true" })).toBe("https://graph.facebook.com");
  });
});
