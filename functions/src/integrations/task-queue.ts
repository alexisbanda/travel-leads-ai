// Encolado en Cloud Tasks con `firebase-admin/functions` (docs/specs/003-on-lead-created.md).
// Cada tarea lleva un ID de idempotencia: si ya existe, el encolado cuenta como éxito.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFunctions } from "firebase-admin/functions";

/** Payload de las tareas de un lead: solo el ID, los datos se leen en el servidor. */
export interface LeadTaskPayload {
  leadId: string;
}

export interface EnqueueRequest {
  /** Nombre exportado de la función `onTaskDispatched` (= nombre de la cola). */
  functionName: string;
  /** ID de idempotencia de la tarea. */
  id: string;
  payload: LeadTaskPayload;
}

export type EnqueueOutcome = "enqueued" | "already_exists";

export interface TaskEnqueuer {
  enqueue(request: EnqueueRequest): Promise<EnqueueOutcome>;
}

/** Lo que se usa de `TaskQueue` de `firebase-admin/functions`. */
export interface TaskQueueLike {
  enqueue(data: Record<string, unknown>, opts?: { id?: string }): Promise<void>;
}

/**
 * Nombre de la cola para `taskQueue()`. Sin región, el SDK usaría su región por
 * defecto, no la de la instancia: se pasa `locations/<región>/functions/<nombre>`.
 */
export function queueResourceName(functionName: string, region: string): string {
  return region === "" ? functionName : `locations/${region}/functions/${functionName}`;
}

/** `true` si el error es `functions/task-already-exists` (ID de tarea repetido). */
export function isTaskAlreadyExists(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const { code } = error as { code: unknown };
  return code === "functions/task-already-exists" || code === "task-already-exists";
}

/** `TaskEnqueuer` sobre cualquier `TaskQueueLike` (inyectable en tests). */
export function createTaskQueueEnqueuer(
  queueFor: (resourceName: string) => TaskQueueLike,
  region: string,
): TaskEnqueuer {
  return {
    async enqueue({ functionName, id, payload }) {
      try {
        await queueFor(queueResourceName(functionName, region)).enqueue({ ...payload }, { id });
        return "enqueued";
      } catch (error) {
        if (isTaskAlreadyExists(error)) return "already_exists";
        throw error;
      }
    },
  };
}

/** `TaskEnqueuer` real sobre Cloud Tasks (app por defecto, inicializada de forma perezosa). */
export function createCloudTaskEnqueuer(region: string): TaskEnqueuer {
  return createTaskQueueEnqueuer((name) => {
    if (getApps().length === 0) initializeApp();
    return getFunctions().taskQueue(name);
  }, region);
}
