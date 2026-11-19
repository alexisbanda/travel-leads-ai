// Encolado en Cloud Tasks con `firebase-admin/functions` (docs/specs/003-on-lead-created.md).
// Cada tarea lleva un ID de idempotencia: si ya existe, el encolado cuenta como éxito.
import { getApps, initializeApp, type App, type AppOptions } from "firebase-admin/app";
import { getFunctions } from "firebase-admin/functions";
import { defaultAdminApp } from "./firebase-app.js";

/** Nombre de la app de admin usada solo para encolar contra el emulador de Cloud Tasks. */
const EMULATOR_APP_NAME = "tla-tasks-emulator";

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

/**
 * Opciones de la app de admin usada para encolar. Fuera del emulador, `null`
 * (se usa la app por defecto). Dentro del emulador (`FUNCTIONS_EMULATOR === "true"`),
 * una credencial ficticia: el emulador de Cloud Tasks no valida tokens de Google, pero
 * el SDK de admin exige poder resolver un `serviceAccountId` y un token de acceso antes
 * de llamar a `taskQueue().enqueue()` (si no, falla con `app/invalid-credential`).
 */
export function taskQueueAppOptions(
  env: NodeJS.ProcessEnv = process.env,
): AppOptions | null {
  if (env.FUNCTIONS_EMULATOR !== "true") return null;
  const projectId = env.GCLOUD_PROJECT ?? "demo-project";
  return {
    projectId,
    credential: {
      getAccessToken: async () => ({
        access_token: "emulator-access-token",
        expires_in: 3600,
      }),
    },
    serviceAccountId: `tasks-emulator@${projectId}.iam.gserviceaccount.com`,
  };
}

/** `TaskEnqueuer` real sobre Cloud Tasks (app por defecto, inicializada de forma perezosa). */
export function createCloudTaskEnqueuer(region: string): TaskEnqueuer {
  return createTaskQueueEnqueuer((name) => {
    const emulatorOptions = taskQueueAppOptions();
    if (emulatorOptions === null) {
      return getFunctions(defaultAdminApp()).taskQueue(name);
    }
    const existing = getApps().find((app) => app.name === EMULATOR_APP_NAME);
    const app: App = existing ?? initializeApp(emulatorOptions, EMULATOR_APP_NAME);
    return getFunctions(app).taskQueue(name);
  }, region);
}
