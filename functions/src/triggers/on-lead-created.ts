// `onLeadCreated` (docs/specs/003-on-lead-created.md): al crear `leads/{leadId}` encola
// una tarea por acción activa, cada una con su ID de idempotencia derivado del leadId.
// Logs: solo `leadId`, acción, resultado y nombre del error.
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { Ulid } from "@tla/shared";
import {
  activeLeadTasks,
  errorDetail,
  isStaleLeadCreatedEvent,
  taskIdFor,
  type LeadTaskAction,
  type LeadTasksConfig,
} from "../domain/lead-tasks.js";
import {
  createCloudTaskEnqueuer,
  type EnqueueOutcome,
  type TaskEnqueuer,
} from "../integrations/task-queue.js";
import { LEAD_TASK_FUNCTIONS } from "../tasks/names.js";

export interface EnqueuedLeadTask {
  action: LeadTaskAction;
  taskId: string;
  outcome: EnqueueOutcome;
}

/** Algunas acciones no se pudieron encolar; las demás sí. */
export class LeadTaskEnqueueError extends Error {
  override name = "LeadTaskEnqueueError";
  constructor(
    readonly failed: { action: LeadTaskAction; error: unknown }[],
    readonly enqueued: EnqueuedLeadTask[],
  ) {
    super(`no se pudieron encolar: ${failed.map((f) => f.action).join(", ")}`);
  }
}

/**
 * Encola una tarea por acción activa. Intenta todas aunque falle alguna y lanza
 * `LeadTaskEnqueueError` si alguna falló (reencolar es seguro: mismo ID de tarea).
 */
export async function enqueueLeadTasks(
  leadId: string,
  config: LeadTasksConfig,
  enqueuer: TaskEnqueuer,
): Promise<EnqueuedLeadTask[]> {
  const requests = activeLeadTasks(config).map((action) => ({
    action,
    taskId: taskIdFor(action, leadId),
  }));
  const settled = await Promise.allSettled(
    requests.map(({ action, taskId }) =>
      enqueuer.enqueue({
        functionName: LEAD_TASK_FUNCTIONS[action],
        id: taskId,
        payload: { leadId },
      }),
    ),
  );
  const enqueued: EnqueuedLeadTask[] = [];
  const failed: { action: LeadTaskAction; error: unknown }[] = [];
  settled.forEach((result, i) => {
    const { action, taskId } = requests[i]!;
    if (result.status === "fulfilled") enqueued.push({ action, taskId, outcome: result.value });
    else failed.push({ action, error: result.reason });
  });
  if (failed.length > 0) throw new LeadTaskEnqueueError(failed, enqueued);
  return enqueued;
}

export interface OnLeadCreatedLogFields {
  leadId?: string;
  action?: LeadTaskAction;
  outcome?: EnqueueOutcome | "failed";
  error?: string;
}

export interface OnLeadCreatedDeps {
  config: LeadTasksConfig;
  enqueuer: () => TaskEnqueuer;
  now: () => Date;
  log: {
    info(message: string, fields: OnLeadCreatedLogFields): void;
    warn(message: string, fields: OnLeadCreatedLogFields): void;
    error(message: string, fields: OnLeadCreatedLogFields): void;
  };
}

/** Lo que se usa del evento de Firestore. */
export interface LeadCreatedEvent {
  params: { leadId: string };
  /** Hora del evento (RFC 3339). */
  time: string;
}

export function createOnLeadCreatedHandler(deps: OnLeadCreatedDeps) {
  return async (event: LeadCreatedEvent): Promise<void> => {
    const { leadId } = event.params;
    if (!Ulid.safeParse(leadId).success) {
      deps.log.warn("onLeadCreated: leadId no es un ULID, no se encola", {});
      return;
    }
    if (isStaleLeadCreatedEvent(new Date(event.time), deps.now())) {
      deps.log.error("onLeadCreated: evento demasiado antiguo, no se encola", { leadId });
      return;
    }
    try {
      const enqueued = await enqueueLeadTasks(leadId, deps.config, deps.enqueuer());
      for (const { action, outcome } of enqueued) {
        deps.log.info("onLeadCreated: tarea encolada", { leadId, action, outcome });
      }
    } catch (error) {
      if (error instanceof LeadTaskEnqueueError) {
        for (const { action, outcome } of error.enqueued) {
          deps.log.info("onLeadCreated: tarea encolada", { leadId, action, outcome });
        }
        for (const failure of error.failed) {
          deps.log.error("onLeadCreated: no se pudo encolar", {
            leadId,
            action: failure.action,
            outcome: "failed",
            error: errorDetail(failure.error),
          });
        }
      }
      throw error;
    }
  };
}

/** Parte de la configuración resuelta que usa el trigger. */
export interface OnLeadCreatedConfig extends LeadTasksConfig {
  infra: { region: string };
}

/**
 * Trigger de Firestore. `retry: true`: si falla el encolado se reintenta; los IDs de
 * tarea evitan duplicados y los eventos de más de 50 minutos se descartan.
 */
export function createOnLeadCreatedFunction(config: OnLeadCreatedConfig) {
  let enqueuer: TaskEnqueuer | undefined;
  const handler = createOnLeadCreatedHandler({
    config,
    enqueuer: () => (enqueuer ??= createCloudTaskEnqueuer(config.infra.region)),
    now: () => new Date(),
    log: {
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warn(message, fields),
      error: (message, fields) => logger.error(message, fields),
    },
  });
  return onDocumentCreated({ document: "leads/{leadId}", retry: true }, (event) =>
    handler({ params: event.params, time: event.time }),
  );
}
