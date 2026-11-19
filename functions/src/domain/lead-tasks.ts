// Reglas puras de la orquestación tras crear un lead (docs/specs/003-on-lead-created.md):
// qué tareas se encolan, con qué ID de idempotencia y qué evento registra cada resultado.
import {
  LeadEventDetail,
  type LeadTaskAction,
  type LeadTaskEventType,
  type LeadTaskOutcome,
} from "@tla/shared";

export type { LeadTaskAction, LeadTaskEventType, LeadTaskOutcome };

/** Actor de los eventos que registran las tareas (el mismo que el de `created`). */
export const LEAD_TASK_ACTOR = "system";

/** Parte de la configuración resuelta que decide qué tareas están activas. */
export interface LeadTasksConfig {
  channels: { meta: { pixelId: string } };
}

/**
 * Acciones activas para la instancia, en orden de encolado:
 * - `crm.upsert`: siempre (`channels.crm` es obligatorio).
 * - `agency.notify`: siempre (el handler decide si hay canal).
 * - `meta.capi.lead`: solo con `channels.meta.pixelId`.
 */
export function activeLeadTasks(config: LeadTasksConfig): LeadTaskAction[] {
  const actions: LeadTaskAction[] = ["crm.upsert", "agency.notify"];
  if (config.channels.meta.pixelId.trim() !== "") actions.push("meta.capi.lead");
  return actions;
}

const TASK_ID_PART = /^[A-Za-z0-9_-]+$/;

/**
 * ID de idempotencia de la tarea en Cloud Tasks (solo letras, dígitos, `-` y `_`):
 * `crm.upsert` + `L1` → `crm-upsert-L1`. El mismo lead produce siempre el mismo ID,
 * así que reencolarlo no duplica la tarea.
 */
export function taskIdFor(action: LeadTaskAction, leadId: string): string {
  if (!TASK_ID_PART.test(leadId)) {
    throw new Error("leadId inválido para un ID de tarea: solo letras, dígitos, - y _");
  }
  return `${action.replaceAll(".", "-")}-${leadId}`;
}

/** Tipo de evento del resultado de una tarea: `<acción>.<resultado>`. */
export function taskEventType(action: LeadTaskAction, outcome: LeadTaskOutcome): LeadTaskEventType {
  return `${action}.${outcome}`;
}

/**
 * `detail` de un evento `failed`: el nombre del error si es un código válido
 * (p. ej. `TypeError`); si no, `Error`. Nunca el mensaje, que puede llevar datos personales.
 */
export function errorDetail(error: unknown): string {
  const name = error instanceof Error ? error.name : undefined;
  return name !== undefined && LeadEventDetail.safeParse(name).success ? name : "Error";
}

/**
 * Antigüedad máxima del evento de alta para encolar. Cloud Tasks solo deduplica un ID
 * durante ~1 hora tras ejecutar la tarea: un reintento posterior podría duplicarla.
 */
export const LEAD_CREATED_MAX_AGE_MS = 50 * 60 * 1000;

/** `true` si el evento es demasiado antiguo para encolar sin riesgo de duplicados. */
export function isStaleLeadCreatedEvent(
  eventTime: Date,
  now: Date,
  maxAgeMs: number = LEAD_CREATED_MAX_AGE_MS,
): boolean {
  return now.getTime() - eventTime.getTime() > maxAgeMs;
}
