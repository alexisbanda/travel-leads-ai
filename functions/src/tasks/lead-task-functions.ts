// Funciones `onTaskDispatched` de las tareas de un lead. Son fábricas porque las
// opciones globales (`region`) se leen al definirse: `index.ts` las llama tras
// `setGlobalOptions`. Cada acción tiene su cola y su política de reintentos.
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { onTaskDispatched, type TaskQueueOptions } from "firebase-functions/v2/tasks";
import { ulid } from "../domain/ulid.js";
import { crmAdapterFor, type CrmConfig } from "../integrations/crm/index.js";
import { sendCapiEvents } from "../integrations/meta-capi.js";
import { notifierFor, type NotifierConfig } from "../integrations/notifier/index.js";
import { secretName } from "../integrations/secrets.js";
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

type Secret = ReturnType<typeof defineSecret>;

function taskFunction(handler: LeadTaskHandler, secrets: Secret[] = []) {
  const options: TaskQueueOptions =
    secrets.length > 0 ? { ...TASK_OPTIONS, secrets } : TASK_OPTIONS;
  return onTaskDispatched(options, (request) => handler(request.data));
}

export function createCrmUpsertTaskFunction(config: CrmConfig) {
  return taskFunction(
    createCrmUpsertHandler({ ...defaultDeps(), crm: () => crmAdapterFor(config) }),
  );
}

/**
 * Con `agency.notify.channel: email` ata el secreto de `agency.notify.target` (las
 * direcciones de los destinatarios); con otro canal o sin aviso no declara secretos.
 */
export function createAgencyNotifyTaskFunction(config: NotifierConfig) {
  const notify = config.agency.notify;
  const target = notify?.channel === "email" ? defineSecret(secretName(notify.target)) : undefined;
  const readTarget = () => {
    if (target === undefined) throw new Error("agency.notify.target no está atado a la función");
    return target.value();
  };
  return taskFunction(
    createAgencyNotifyHandler({
      ...defaultDeps(),
      notifier: () => notifierFor(config, readTarget),
    }),
    target === undefined ? [] : [target],
  );
}

/** Parte de la configuración resuelta que usa `meta.capi.lead`. */
export interface MetaCapiTaskConfig {
  channels: { meta: { pixelId: string; capiTokenSecret: string } };
}

/**
 * `test_event_code` del Administrador de eventos de Meta: **solo para pruebas en dev**
 * (docs/11). Vacío (por defecto) → no se envía. Nunca se define en prod.
 */
export const META_CAPI_TEST_EVENT_CODE_PARAM = "META_CAPI_TEST_EVENT_CODE";
const metaCapiTestEventCode = defineString(META_CAPI_TEST_EVENT_CODE_PARAM, { default: "" });

/**
 * Con `channels.meta.pixelId` ata el secreto de `channels.meta.capiTokenSecret`; sin
 * píxel no declara secretos (la tarea no se encola, ver `activeLeadTasks`).
 */
export function createMetaCapiLeadTaskFunction(config: MetaCapiTaskConfig) {
  const meta = config.channels.meta;
  const pixelId = meta.pixelId.trim();
  const token = pixelId !== "" ? defineSecret(secretName(meta.capiTokenSecret)) : undefined;
  const capi = () => {
    if (token === undefined) throw new Error("channels.meta.pixelId vacío: no hay token atado");
    return (events: Parameters<typeof sendCapiEvents>[1]) => {
      const testEventCode = metaCapiTestEventCode.value();
      return sendCapiEvents(
        {
          pixelId,
          accessToken: token.value(),
          ...(testEventCode !== "" && { testEventCode }),
        },
        events,
      );
    };
  };
  return taskFunction(
    createMetaCapiLeadHandler({ ...defaultDeps(), capi }),
    token === undefined ? [] : [token],
  );
}
