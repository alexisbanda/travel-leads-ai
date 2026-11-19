// Funciones `onTaskDispatched` de las tareas de un lead. Son fábricas porque las
// opciones globales (`region`) se leen al definirse: `index.ts` las llama tras
// `setGlobalOptions`. Cada acción tiene su cola y su política de reintentos.
import { logger } from "firebase-functions";
import { onTaskDispatched, type TaskQueueOptions } from "firebase-functions/v2/tasks";
import { ulid } from "../domain/ulid.js";
import { crmAdapterFor, type CrmConfig } from "../integrations/crm/index.js";
import { notifierFor, type NotifierConfig } from "../integrations/notifier/index.js";
import {
  createAgencyNotifyHandler,
  createCrmUpsertHandler,
  createMetaCapiLeadHandler,
  type LeadTaskDeps,
  type LeadTaskHandler,
} from "./handlers.js";
import { createFirestoreLeadTaskStore } from "./lead-task-store.js";

/** Reintentos de Cloud Tasks: 5 intentos con *backoff* exponencial de 10 s a 5 min. */
export const LEAD_TASK_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 10,
  maxBackoffSeconds: 300,
} as const;

/** Límites modestos para no saturar a los proveedores. */
export const LEAD_TASK_RATE_LIMITS = {
  maxConcurrentDispatches: 5,
  maxDispatchesPerSecond: 5,
} as const;

const TASK_OPTIONS: TaskQueueOptions = {
  retryConfig: { ...LEAD_TASK_RETRY_CONFIG },
  rateLimits: { ...LEAD_TASK_RATE_LIMITS },
};

function defaultDeps(): LeadTaskDeps {
  return {
    store: createFirestoreLeadTaskStore(),
    newId: () => ulid(),
    now: () => new Date(),
    // Acceso perezoso a `logger`: no se resuelve al definir la función.
    log: {
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warn(message, fields),
      error: (message, fields) => logger.error(message, fields),
    },
  };
}

function taskFunction(handler: LeadTaskHandler) {
  return onTaskDispatched(TASK_OPTIONS, (request) => handler(request.data));
}

export function createCrmUpsertTaskFunction(config: CrmConfig) {
  return taskFunction(
    createCrmUpsertHandler({ ...defaultDeps(), crm: () => crmAdapterFor(config) }),
  );
}

export function createAgencyNotifyTaskFunction(config: NotifierConfig) {
  return taskFunction(
    createAgencyNotifyHandler({ ...defaultDeps(), notifier: () => notifierFor(config) }),
  );
}

export function createMetaCapiLeadTaskFunction() {
  return taskFunction(createMetaCapiLeadHandler(defaultDeps()));
}
