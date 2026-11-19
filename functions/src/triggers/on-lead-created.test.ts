import { describe, expect, it } from "vitest";
import {
  createTaskQueueEnqueuer,
  isTaskAlreadyExists,
  queueResourceName,
  type EnqueueRequest,
  type TaskEnqueuer,
  type TaskQueueLike,
} from "../integrations/task-queue.js";
import {
  createOnLeadCreatedHandler,
  enqueueLeadTasks,
  LeadTaskEnqueueError,
  type OnLeadCreatedLogFields,
} from "./on-lead-created.js";

// ULID ficticio de pruebas.
const LEAD_ID = "01J0000000000000000000000A";
const NOW = new Date("2030-01-15T10:00:00.000Z");
const WITH_PIXEL = { channels: { meta: { pixelId: "123456" } } };
const WITHOUT_PIXEL = { channels: { meta: { pixelId: "" } } };

/** Cola falsa con la semántica de Cloud Tasks: un ID repetido lanza `task-already-exists`. */
function fakeQueues() {
  const tasks: { queue: string; id: string | undefined; data: Record<string, unknown> }[] = [];
  const queueFor = (queue: string): TaskQueueLike => ({
    async enqueue(data, opts) {
      if (tasks.some((t) => t.queue === queue && t.id === opts?.id)) {
        throw Object.assign(new Error("A task with ID already exists"), {
          code: "functions/task-already-exists",
        });
      }
      tasks.push({ queue, id: opts?.id, data });
    },
  });
  return { tasks, queueFor };
}

describe("enqueueLeadTasks", () => {
  it("con pixelId encola 3 tareas con su ID de idempotencia y payload { leadId }", async () => {
    const queues = fakeQueues();
    const result = await enqueueLeadTasks(
      LEAD_ID,
      WITH_PIXEL,
      createTaskQueueEnqueuer(queues.queueFor, "zz-test1"),
    );
    expect(result.map((r) => [r.taskId, r.outcome])).toEqual([
      [`crm-upsert-${LEAD_ID}`, "enqueued"],
      [`agency-notify-${LEAD_ID}`, "enqueued"],
      [`meta-capi-lead-${LEAD_ID}`, "enqueued"],
    ]);
    expect(queues.tasks).toEqual([
      {
        queue: "locations/zz-test1/functions/crmUpsertTask",
        id: `crm-upsert-${LEAD_ID}`,
        data: { leadId: LEAD_ID },
      },
      {
        queue: "locations/zz-test1/functions/agencyNotifyTask",
        id: `agency-notify-${LEAD_ID}`,
        data: { leadId: LEAD_ID },
      },
      {
        queue: "locations/zz-test1/functions/metaCapiLeadTask",
        id: `meta-capi-lead-${LEAD_ID}`,
        data: { leadId: LEAD_ID },
      },
    ]);
  });

  it("sin pixelId encola 2 tareas", async () => {
    const queues = fakeQueues();
    await enqueueLeadTasks(LEAD_ID, WITHOUT_PIXEL, createTaskQueueEnqueuer(queues.queueFor, ""));
    expect(queues.tasks.map((t) => t.id)).toEqual([
      `crm-upsert-${LEAD_ID}`,
      `agency-notify-${LEAD_ID}`,
    ]);
  });

  it("reencolar el mismo lead no duplica: already-exists cuenta como éxito", async () => {
    const queues = fakeQueues();
    const enqueuer = createTaskQueueEnqueuer(queues.queueFor, "");
    await enqueueLeadTasks(LEAD_ID, WITH_PIXEL, enqueuer);
    const again = await enqueueLeadTasks(LEAD_ID, WITH_PIXEL, enqueuer);
    expect(again.map((r) => r.outcome)).toEqual([
      "already_exists",
      "already_exists",
      "already_exists",
    ]);
    expect(queues.tasks).toHaveLength(3);
  });

  it("si falla una acción intenta las demás y lanza con las fallidas", async () => {
    const seen: string[] = [];
    const enqueuer: TaskEnqueuer = {
      async enqueue({ functionName }: EnqueueRequest) {
        seen.push(functionName);
        if (functionName === "crmUpsertTask") throw new TypeError("cola no disponible");
        return "enqueued";
      },
    };
    const error = await enqueueLeadTasks(LEAD_ID, WITH_PIXEL, enqueuer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LeadTaskEnqueueError);
    const failure = error as LeadTaskEnqueueError;
    expect(failure.failed.map((f) => f.action)).toEqual(["crm.upsert"]);
    expect(failure.enqueued.map((e) => e.action)).toEqual(["agency.notify", "meta.capi.lead"]);
    expect(seen).toEqual(["crmUpsertTask", "agencyNotifyTask", "metaCapiLeadTask"]);
  });
});

describe("task-queue", () => {
  it("queueResourceName usa la región de la instancia si la hay", () => {
    expect(queueResourceName("crmUpsertTask", "zz-test1")).toBe(
      "locations/zz-test1/functions/crmUpsertTask",
    );
    expect(queueResourceName("crmUpsertTask", "")).toBe("crmUpsertTask");
  });

  it("isTaskAlreadyExists reconoce solo el código de ID repetido", () => {
    expect(isTaskAlreadyExists({ code: "functions/task-already-exists" })).toBe(true);
    expect(isTaskAlreadyExists({ code: "functions/permission-denied" })).toBe(false);
    expect(isTaskAlreadyExists(new Error("x"))).toBe(false);
  });

  it("otros errores del encolado se propagan", async () => {
    const enqueuer = createTaskQueueEnqueuer(
      () => ({
        enqueue: async () => {
          throw Object.assign(new Error("denegado"), { code: "functions/permission-denied" });
        },
      }),
      "",
    );
    await expect(
      enqueuer.enqueue({ functionName: "crmUpsertTask", id: "x", payload: { leadId: LEAD_ID } }),
    ).rejects.toThrow("denegado");
  });
});

describe("createOnLeadCreatedHandler", () => {
  function setup(enqueuer: TaskEnqueuer) {
    const logs: { level: string; message: string; fields: OnLeadCreatedLogFields }[] = [];
    const log = (level: string) => (message: string, fields: OnLeadCreatedLogFields) =>
      logs.push({ level, message, fields });
    const handler = createOnLeadCreatedHandler({
      config: WITH_PIXEL,
      enqueuer: () => enqueuer,
      now: () => NOW,
      log: { info: log("info"), warn: log("warn"), error: log("error") },
    });
    return { handler, logs };
  }
  const recording = () => {
    const ids: string[] = [];
    const enqueuer: TaskEnqueuer = {
      async enqueue({ id }) {
        ids.push(id);
        return "enqueued";
      },
    };
    return { ids, enqueuer };
  };

  it("encola las tareas y registra solo leadId, acción y resultado", async () => {
    const { ids, enqueuer } = recording();
    const { handler, logs } = setup(enqueuer);
    await handler({ params: { leadId: LEAD_ID }, time: NOW.toISOString() });
    expect(ids).toHaveLength(3);
    expect(logs.map((l) => Object.keys(l.fields).sort())).toEqual([
      ["action", "leadId", "outcome"],
      ["action", "leadId", "outcome"],
      ["action", "leadId", "outcome"],
    ]);
  });

  it("descarta eventos de más de 50 minutos sin encolar", async () => {
    const { ids, enqueuer } = recording();
    const { handler, logs } = setup(enqueuer);
    const old = new Date(NOW.getTime() - 51 * 60 * 1000).toISOString();
    await handler({ params: { leadId: LEAD_ID }, time: old });
    expect(ids).toEqual([]);
    expect(logs.map((l) => l.level)).toEqual(["error"]);
  });

  it("no encola si el leadId no es un ULID", async () => {
    const { ids, enqueuer } = recording();
    const { handler } = setup(enqueuer);
    await handler({ params: { leadId: "no-ulid" }, time: NOW.toISOString() });
    expect(ids).toEqual([]);
  });

  it("si falla el encolado registra el nombre del error y re-lanza (reintento del trigger)", async () => {
    const { handler, logs } = setup({
      async enqueue({ functionName }) {
        if (functionName === "crmUpsertTask") throw new TypeError("mensaje que no se registra");
        return "enqueued";
      },
    });
    await expect(
      handler({ params: { leadId: LEAD_ID }, time: NOW.toISOString() }),
    ).rejects.toBeInstanceOf(LeadTaskEnqueueError);
    expect(logs.filter((l) => l.level === "error").map((l) => l.fields)).toEqual([
      { leadId: LEAD_ID, action: "crm.upsert", outcome: "failed", error: "TypeError" },
    ]);
    expect(JSON.stringify(logs)).not.toContain("mensaje que no se registra");
  });
});
