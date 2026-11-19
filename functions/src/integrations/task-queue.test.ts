import { describe, expect, it } from "vitest";
import {
  createTaskQueueEnqueuer,
  isTaskAlreadyExists,
  queueResourceName,
  taskQueueAppOptions,
  type TaskQueueLike,
} from "./task-queue.js";

describe("queueResourceName", () => {
  it("devuelve el nombre de función sin región cuando la región es cadena vacía", () => {
    expect(queueResourceName("onTaskDispatched", "")).toBe("onTaskDispatched");
  });

  it("antepone locations/<región>/functions/<nombre> cuando hay región", () => {
    expect(queueResourceName("onTaskDispatched", "example-region1")).toBe(
      "locations/example-region1/functions/onTaskDispatched",
    );
  });
});

describe("isTaskAlreadyExists", () => {
  it("reconoce el código de error de tarea duplicada", () => {
    expect(isTaskAlreadyExists({ code: "functions/task-already-exists" })).toBe(true);
    expect(isTaskAlreadyExists({ code: "task-already-exists" })).toBe(true);
  });

  it("devuelve false para otros errores o valores no reconocidos", () => {
    expect(isTaskAlreadyExists({ code: "functions/internal" })).toBe(false);
    expect(isTaskAlreadyExists(new Error("boom"))).toBe(false);
    expect(isTaskAlreadyExists(null)).toBe(false);
    expect(isTaskAlreadyExists("nope")).toBe(false);
  });
});

describe("createTaskQueueEnqueuer", () => {
  it("devuelve enqueued cuando el encolado tiene éxito", async () => {
    const calls: Array<{ data: Record<string, unknown>; opts?: { id?: string } }> = [];
    const queue: TaskQueueLike = {
      async enqueue(data: Record<string, unknown>, opts?: { id?: string }) {
        calls.push({ data, opts });
      },
    };
    const enqueuer = createTaskQueueEnqueuer(() => queue, "example-region1");

    const outcome = await enqueuer.enqueue({
      functionName: "onTaskDispatched",
      id: "lead-1",
      payload: { leadId: "lead-1" },
    });

    expect(outcome).toBe("enqueued");
    expect(calls).toEqual([
      { data: { leadId: "lead-1" }, opts: { id: "lead-1" } },
    ]);
  });

  it("devuelve already_exists cuando el encolado falla por ID duplicado", async () => {
    const queue: TaskQueueLike = {
      async enqueue() {
        throw { code: "functions/task-already-exists" };
      },
    };
    const enqueuer = createTaskQueueEnqueuer(() => queue, "");

    const outcome = await enqueuer.enqueue({
      functionName: "onTaskDispatched",
      id: "lead-1",
      payload: { leadId: "lead-1" },
    });

    expect(outcome).toBe("already_exists");
  });

  it("relanza otros errores del encolado", async () => {
    const queue: TaskQueueLike = {
      async enqueue() {
        throw new Error("boom");
      },
    };
    const enqueuer = createTaskQueueEnqueuer(() => queue, "");

    await expect(
      enqueuer.enqueue({
        functionName: "onTaskDispatched",
        id: "lead-1",
        payload: { leadId: "lead-1" },
      }),
    ).rejects.toThrow("boom");
  });
});

describe("taskQueueAppOptions", () => {
  it("devuelve null fuera del emulador cuando FUNCTIONS_EMULATOR no está definido", () => {
    expect(taskQueueAppOptions({})).toBeNull();
  });

  it("devuelve null cuando FUNCTIONS_EMULATOR es 'false'", () => {
    expect(taskQueueAppOptions({ FUNCTIONS_EMULATOR: "false" })).toBeNull();
  });

  it("devuelve null cuando FUNCTIONS_EMULATOR es '1' (no es exactamente 'true')", () => {
    expect(taskQueueAppOptions({ FUNCTIONS_EMULATOR: "1" })).toBeNull();
  });

  it("devuelve opciones con credencial ficticia cuando FUNCTIONS_EMULATOR es 'true'", async () => {
    const options = taskQueueAppOptions({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "example-project",
    });

    expect(options).not.toBeNull();
    expect(options?.projectId).toBe("example-project");
    expect(options?.serviceAccountId).toBe(
      "tasks-emulator@example-project.iam.gserviceaccount.com",
    );

    const credential = options?.credential as { getAccessToken(): Promise<unknown> };
    await expect(credential.getAccessToken()).resolves.toEqual({
      access_token: "emulator-access-token",
      expires_in: 3600,
    });
  });

  it("usa un ID de proyecto por defecto si GCLOUD_PROJECT no está definido", () => {
    const options = taskQueueAppOptions({ FUNCTIONS_EMULATOR: "true" });

    expect(options?.projectId).toBe("demo-project");
    expect(options?.serviceAccountId).toBe(
      "tasks-emulator@demo-project.iam.gserviceaccount.com",
    );
  });
});
