import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { IngestTransactionRequest } from "../integrations/landing-lead-store.js";
import { MetaGraphApiError } from "../integrations/meta-graph-api.js";
import {
  createProcessMetaInboxHandler,
  leadgenIdOf,
  secretName,
  shouldProcessInbox,
  type ProcessMetaInboxDeps,
  type ProcessMetaInboxLogFields,
} from "./process-meta-inbox.js";

/** Región sintética: no corresponde a ninguna región real. */
const FAKE_REGION = "region-sintetica";
vi.mock("../config.js", () => ({
  loadInstanceConfig: () => ({
    infra: { region: FAKE_REGION },
    agency: {},
    channels: { meta: { pageTokenSecret: "secret:PAGINA_DE_PRUEBA" } },
  }),
}));

const NOW = new Date("2030-01-15T10:00:00.000Z");
const INBOX_ID = "meta_000000000000001";

function graphLead(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../test/fixtures/meta-graph-lead.json", import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function inboxDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "meta",
    payload: { leadgen_id: "000000000000001", form_id: "000000000000400" },
    ...overrides,
  };
}

function setup(overrides: Partial<ProcessMetaInboxDeps> = {}) {
  let n = 0;
  const logs: { level: string; message: string; fields: ProcessMetaInboxLogFields }[] = [];
  const record = (level: string) => (message: string, fields: ProcessMetaInboxLogFields) =>
    logs.push({ level, message, fields });
  const deps: ProcessMetaInboxDeps = {
    settings: () => ({
      phoneDefaultRegion: "ES",
      marketCountry: "ES",
      locale: "es-ES", // hardcoding-ok: valor de prueba
      dataRetentionMonths: 24,
      legalTextsVersion: "1.0.0",
      fieldMap: {
        cuando_quieres_viajar: { field: "travelMonth", values: { marzo_2027: "2027-03" } },
      },
    }),
    fetchLead: vi.fn(async () => graphLead()),
    newId: () => `01ARZ3NDEKTSV4RRFFQ69G5FA${n++}`,
    now: () => NOW,
    runIngestTransaction: vi.fn(async (request: IngestTransactionRequest) => ({
      leadId: request.newLead.leadId,
      deduplicated: false,
    })),
    markInboxError: vi.fn(async () => undefined),
    log: { info: record("info"), warn: record("warn"), error: record("error") },
    ...overrides,
  };
  return { deps, logs, handler: createProcessMetaInboxHandler(deps) };
}

describe("shouldProcessInbox", () => {
  it.each([
    ["pendiente sin status", INBOX_ID, inboxDoc(), true],
    ["status pending", INBOX_ID, inboxDoc({ status: "pending" }), true],
    ["ya procesado", INBOX_ID, inboxDoc({ status: "processed" }), false],
    ["con error", INBOX_ID, inboxDoc({ status: "error" }), false],
    ["borrado", INBOX_ID, undefined, false],
    ["otro prefijo", "wa_000000000000001", inboxDoc(), false],
    ["otro source", INBOX_ID, inboxDoc({ source: "whatsapp" }), false],
  ])("%s → %s", (_, inboxId, after, expected) => {
    expect(shouldProcessInbox({ inboxId, after })).toBe(expected);
  });
});

describe("leadgenIdOf", () => {
  it.each([
    [inboxDoc(), "000000000000001"],
    [{ payload: {} }, undefined],
    [{ payload: { leadgen_id: 1 } }, undefined],
    [{ payload: { leadgen_id: "../x" } }, undefined],
    [{}, undefined],
  ])("%j → %s", (doc, expected) => {
    expect(leadgenIdOf(doc)).toBe(expected);
  });
});

describe("secretName", () => {
  it("quita el prefijo secret:", () => {
    expect(secretName("secret:META_PAGE_ACCESS_TOKEN")).toBe("META_PAGE_ACCESS_TOKEN");
  });
});

describe("createProcessMetaInboxHandler", () => {
  it("crea el lead con el inbox como marcador de idempotencia", async () => {
    const { deps, handler, logs } = setup();
    await expect(handler({ inboxId: INBOX_ID, after: inboxDoc() })).resolves.toBe("created");
    expect(deps.fetchLead).toHaveBeenCalledWith("000000000000001");
    const request = vi.mocked(deps.runIngestTransaction).mock.calls[0]![0];
    expect(request.inbox).toEqual({ collection: "inbox", id: INBOX_ID });
    expect(request.now).toBe(NOW);
    expect(request.newLead.lead.source).toBe("meta_lead_ad");
    expect(request.newLead.consent.channel).toBe("meta_form");
    expect(request.dedupeKey).toBe(request.newLead.lead.dedupeKey);
    expect(deps.markInboxError).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatchObject({
      level: "info",
      fields: { inboxId: INBOX_ID, leadId: request.newLead.leadId, result: "created" },
    });
  });

  it("informa reengaged y already_processed", async () => {
    const reengaged = setup({
      runIngestTransaction: async () => ({ leadId: "x", deduplicated: true }),
    });
    await expect(reengaged.handler({ inboxId: INBOX_ID, after: inboxDoc() })).resolves.toBe(
      "reengaged",
    );
    const again = setup({
      runIngestTransaction: async () => ({
        leadId: "x",
        deduplicated: false,
        alreadyProcessed: true,
      }),
    });
    await expect(again.handler({ inboxId: INBOX_ID, after: inboxDoc() })).resolves.toBe(
      "already_processed",
    );
  });

  it("ignora documentos que no son entregas pendientes sin llamar a nada", async () => {
    const { deps, handler } = setup();
    await expect(
      handler({ inboxId: INBOX_ID, after: inboxDoc({ status: "processed" }) }),
    ).resolves.toBe("ignored");
    expect(deps.fetchLead).not.toHaveBeenCalled();
    expect(deps.markInboxError).not.toHaveBeenCalled();
  });

  it.each([
    [new MetaGraphApiError("status", 500), "graph_api_500"],
    [new MetaGraphApiError("network"), "graph_api_network"],
    [new MetaGraphApiError("invalid_response"), "graph_api_invalid_response"],
    [new Error("secreto ausente"), "internal_error"],
  ])(
    "un fallo de la Graph API marca el inbox (%s) sin lanzar ni crear nada",
    async (error, code) => {
      const { deps, handler } = setup({
        fetchLead: async () => {
          throw error;
        },
      });
      await expect(handler({ inboxId: INBOX_ID, after: inboxDoc() })).resolves.toBe("error");
      expect(deps.markInboxError).toHaveBeenCalledWith(INBOX_ID, code, NOW);
      expect(deps.runIngestTransaction).not.toHaveBeenCalled();
    },
  );

  it("sin leadgen_id marca missing_leadgen_id sin llamar a la Graph API", async () => {
    const { deps, handler } = setup();
    await handler({ inboxId: INBOX_ID, after: inboxDoc({ payload: {} }) });
    expect(deps.fetchLead).not.toHaveBeenCalled();
    expect(deps.markInboxError).toHaveBeenCalledWith(INBOX_ID, "missing_leadgen_id", NOW);
  });

  it("datos sin teléfono ni email marcan invalid_lead_data", async () => {
    const { deps, handler } = setup({
      fetchLead: async () => ({ field_data: [{ name: "full_name", values: ["Viajero Prueba"] }] }),
    });
    await handler({ inboxId: INBOX_ID, after: inboxDoc() });
    expect(deps.markInboxError).toHaveBeenCalledWith(INBOX_ID, "invalid_lead_data", NOW);
    expect(deps.runIngestTransaction).not.toHaveBeenCalled();
  });

  it("legalTextsVersion vacío marca invalid_text_version", async () => {
    const base = setup();
    const { deps, handler } = setup({
      settings: () => ({ ...base.deps.settings(), legalTextsVersion: "" }),
    });
    await handler({ inboxId: INBOX_ID, after: inboxDoc() });
    expect(deps.markInboxError).toHaveBeenCalledWith(INBOX_ID, "invalid_text_version", NOW);
  });

  it("un fallo de la transacción marca internal_error; si no se puede marcar, lanza", async () => {
    const failing = setup({
      runIngestTransaction: async () => {
        throw new Error("aborted");
      },
    });
    await expect(failing.handler({ inboxId: INBOX_ID, after: inboxDoc() })).resolves.toBe("error");
    expect(failing.deps.markInboxError).toHaveBeenCalledWith(INBOX_ID, "internal_error", NOW);

    const both = setup({
      runIngestTransaction: async () => {
        throw new Error("aborted");
      },
      markInboxError: async () => {
        throw new Error("unavailable");
      },
    });
    await expect(both.handler({ inboxId: INBOX_ID, after: inboxDoc() })).rejects.toThrow(
      "unavailable",
    );
  });

  it("los logs no llevan datos personales; las preguntas descartadas solo por clave", async () => {
    const raw = graphLead();
    const fields = raw.field_data as { name: string; values: string[] }[];
    raw.field_data = fields.map((f) =>
      f.name === "cuando_quieres_viajar" ? { name: f.name, values: ["respuesta_desconocida"] } : f,
    );
    const { handler, logs } = setup({ fetchLead: async () => raw });
    await handler({ inboxId: INBOX_ID, after: inboxDoc() });
    expect(logs).toContainEqual({
      level: "warn",
      message: "processMetaInbox: fields_discarded",
      fields: { inboxId: INBOX_ID, discardedKeys: ["cuando_quieres_viajar"] },
    });
    const serialized = JSON.stringify(logs);
    for (const secret of ["Viajero", "600", "example.com", "respuesta_desconocida"]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("index · processMetaInbox", () => {
  it("se exporta con la región, el secreto de channels.meta.pageTokenSecret y sin retry", async () => {
    vi.resetModules();
    const { processMetaInbox } = await import("../index.js");
    const endpoint = (
      processMetaInbox as unknown as {
        __endpoint: {
          region?: unknown;
          secretEnvironmentVariables?: { key: string }[];
          eventTrigger?: { eventFilterPathPatterns?: Record<string, string>; retry?: boolean };
        };
      }
    ).__endpoint;
    expect(endpoint.region).toEqual([FAKE_REGION]);
    expect(endpoint.secretEnvironmentVariables?.map((s) => s.key)).toEqual(["PAGINA_DE_PRUEBA"]);
    expect(endpoint.eventTrigger?.eventFilterPathPatterns).toEqual({ document: "inbox/{inboxId}" });
    expect(endpoint.eventTrigger?.retry).toBe(false);
  });
});
