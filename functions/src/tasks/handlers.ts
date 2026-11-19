// Handlers de las tareas de un lead (docs/specs/003-on-lead-created.md), con
// dependencias inyectadas para probarlos sin Cloud Tasks ni Firestore.
//
// Cada ejecución añade un evento `<acción>.<resultado>` al lead. Un `failed` por error
// del proveedor se re-lanza para que Cloud Tasks reintente según `retryConfig`.
// Logs: solo `leadId`, acción, resultado y `detail` (código o nombre del error).
import { Lead, Ulid, type LeadEvent } from "@tla/shared";
import {
  errorDetail,
  LEAD_TASK_ACTOR,
  taskEventType,
  type LeadTaskAction,
  type LeadTaskOutcome,
} from "../domain/lead-tasks.js";
import type { CrmAdapter } from "../integrations/crm/index.js";
import type { NotifierResolution } from "../integrations/notifier/index.js";
import type { LeadTaskStore } from "./lead-task-store.js";

export interface TaskLogFields {
  action: LeadTaskAction;
  leadId?: string;
  outcome?: LeadTaskOutcome;
  detail?: string;
}

export interface TaskLogger {
  info(message: string, fields: TaskLogFields): void;
  warn(message: string, fields: TaskLogFields): void;
  error(message: string, fields: TaskLogFields): void;
}

export interface LeadTaskDeps {
  store: LeadTaskStore;
  newId: () => string;
  now: () => Date;
  log: TaskLogger;
}

/** Handler de una tarea: recibe el payload (`request.data`) de Cloud Tasks. */
export type LeadTaskHandler = (payload: unknown) => Promise<void>;

/** Campos del lead que usan el CRM y el aviso. */
const TaskLead = Lead.pick({
  leadId: true,
  dedupeKey: true,
  source: true,
  contact: true,
  interest: true,
});

function leadIdFrom(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const parsed = Ulid.safeParse((payload as { leadId?: unknown }).leadId);
  return parsed.success ? parsed.data : undefined;
}

function taskRunner(action: LeadTaskAction, deps: LeadTaskDeps) {
  const fields = (leadId: string, outcome: LeadTaskOutcome, detail?: string): TaskLogFields => ({
    action,
    leadId,
    outcome,
    ...(detail !== undefined && { detail }),
  });

  return {
    /** leadId y datos del lead, o `undefined` si no hay nada que hacer (sin reintento). */
    async load(payload: unknown) {
      const leadId = leadIdFrom(payload);
      if (leadId === undefined) {
        deps.log.warn("lead task: payload sin leadId válido", { action });
        return undefined;
      }
      const data = await deps.store.loadLead(leadId);
      if (data === null) {
        deps.log.warn("lead task: el lead no existe", { action, leadId });
        return undefined;
      }
      return { leadId, data };
    },

    event(outcome: LeadTaskOutcome, detail?: string): LeadEvent {
      return {
        type: taskEventType(action, outcome),
        actor: LEAD_TASK_ACTOR,
        at: deps.now(),
        ...(detail !== undefined && { detail }),
      };
    },

    /** Registra el evento del resultado y lo deja en los logs. */
    async record(leadId: string, outcome: LeadTaskOutcome, detail?: string) {
      await deps.store.addEvent(leadId, deps.newId(), this.event(outcome, detail));
      this.log(leadId, outcome, detail);
    },

    log(leadId: string, outcome: LeadTaskOutcome, detail?: string) {
      const level = outcome === "failed" ? "error" : "info";
      deps.log[level]("lead task", fields(leadId, outcome, detail));
    },
  };
}

/** `crm.upsert`: contacto y deal en el CRM; los IDs se guardan en `lead.crm`. */
export function createCrmUpsertHandler(
  deps: LeadTaskDeps & { crm: () => CrmAdapter | null },
): LeadTaskHandler {
  const run = taskRunner("crm.upsert", deps);
  return async (payload) => {
    const loaded = await run.load(payload);
    if (loaded === undefined) return;
    const { leadId, data } = loaded;

    const adapter = deps.crm();
    if (adapter === null) return run.record(leadId, "skipped", "not_implemented");

    const lead = TaskLead.safeParse(data);
    if (!lead.success) return run.record(leadId, "failed", "invalid_lead");

    let ids;
    try {
      ids = await adapter.upsert(lead.data);
    } catch (error) {
      await run.record(leadId, "failed", errorDetail(error));
      throw error;
    }
    await deps.store.saveCrmIds(leadId, ids, deps.newId(), run.event("succeeded"));
    run.log(leadId, "succeeded");
  };
}

/** `agency.notify`: aviso a la agencia por el canal configurado. */
export function createAgencyNotifyHandler(
  deps: LeadTaskDeps & { notifier: () => NotifierResolution },
): LeadTaskHandler {
  const run = taskRunner("agency.notify", deps);
  return async (payload) => {
    const loaded = await run.load(payload);
    if (loaded === undefined) return;
    const { leadId, data } = loaded;

    const resolution = deps.notifier();
    if (resolution.status === "no_channel") {
      deps.log.warn("agency.notify: la instancia no configura agency.notify", {
        action: "agency.notify",
        leadId,
      });
      return run.record(leadId, "skipped", "no_channel");
    }
    if (resolution.status === "not_implemented") {
      return run.record(leadId, "skipped", "not_implemented");
    }

    const lead = TaskLead.safeParse(data);
    if (!lead.success) return run.record(leadId, "failed", "invalid_lead");

    try {
      await resolution.notifier.notify(lead.data);
    } catch (error) {
      await run.record(leadId, "failed", errorDetail(error));
      throw error;
    }
    await run.record(leadId, "succeeded");
  };
}

/** `meta.capi.lead`: pendiente del ticket de Meta CAPI; hoy solo registra `skipped`. */
export function createMetaCapiLeadHandler(deps: LeadTaskDeps): LeadTaskHandler {
  const run = taskRunner("meta.capi.lead", deps);
  return async (payload) => {
    const loaded = await run.load(payload);
    if (loaded === undefined) return;
    await run.record(loaded.leadId, "skipped", "not_implemented");
  };
}
