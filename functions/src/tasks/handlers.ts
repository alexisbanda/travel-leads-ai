// Handlers de las tareas de un lead (docs/specs/003-on-lead-created.md), con
// dependencias inyectadas para probarlos sin Cloud Tasks ni Firestore.
//
// Cada ejecución añade un evento `<acción>.<resultado>` al lead. Un `failed` por error
// del proveedor se re-lanza para que Cloud Tasks reintente según `retryConfig`.
// Logs: solo `leadId`, acción, resultado y `detail` (código o nombre del error); los
// fallos de Meta CAPI añaden `status`, `code`, `subcode` y `fbtrace_id`.
import { Consent, Lead, Ulid, type LeadEvent } from "@tla/shared";
import { buildCapiLeadEvent, type CapiLeadEvent } from "../domain/capi-lead-event.js";
import {
  errorDetail,
  LEAD_TASK_ACTOR,
  taskEventType,
  type LeadTaskAction,
  type LeadTaskOutcome,
} from "../domain/lead-tasks.js";
import type { CrmAdapter } from "../integrations/crm/index.js";
import { MetaCapiError } from "../integrations/meta-capi.js";
import type { NotifierResolution } from "../integrations/notifier/index.js";
import type { LeadTaskStore } from "./lead-task-store.js";

export interface TaskLogFields {
  action: LeadTaskAction;
  leadId?: string;
  outcome?: LeadTaskOutcome;
  detail?: string;
  /** Status HTTP de una respuesta de error del proveedor. */
  status?: number;
  /** Código de error del proveedor (Meta: `error.code`). */
  code?: number;
  /** Subcódigo de error del proveedor (Meta: `error.error_subcode`). */
  subcode?: number;
  /** Traza de Meta para soporte. */
  fbtrace_id?: string;
}

/** Campos extra de log de un fallo del proveedor; nunca datos personales. */
type ProviderLogFields = Pick<TaskLogFields, "status" | "code" | "subcode" | "fbtrace_id">;

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

/** Campos del lead que usan el CRM, el aviso y Meta CAPI. */
const TaskLead = Lead.pick({
  leadId: true,
  dedupeKey: true,
  source: true,
  contact: true,
  interest: true,
  crm: true,
  attribution: true,
  consentId: true,
  createdAt: true,
});

/** Lo que `meta.capi.lead` lee del consentimiento. */
const TaskConsent = Consent.pick({ purposes: true, withdrawnAt: true });

function leadIdFrom(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const parsed = Ulid.safeParse((payload as { leadId?: unknown }).leadId);
  return parsed.success ? parsed.data : undefined;
}

function taskRunner(action: LeadTaskAction, deps: LeadTaskDeps) {
  const fields = (
    leadId: string,
    outcome: LeadTaskOutcome,
    detail?: string,
    extra: ProviderLogFields = {},
  ): TaskLogFields => ({
    action,
    leadId,
    outcome,
    ...(detail !== undefined && { detail }),
    ...extra,
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
    async record(
      leadId: string,
      outcome: LeadTaskOutcome,
      detail?: string,
      extra?: ProviderLogFields,
    ) {
      await deps.store.addEvent(leadId, deps.newId(), this.event(outcome, detail));
      this.log(leadId, outcome, detail, extra);
    },

    log(leadId: string, outcome: LeadTaskOutcome, detail?: string, extra?: ProviderLogFields) {
      const level = outcome === "failed" ? "error" : "info";
      deps.log[level]("lead task", fields(leadId, outcome, detail, extra));
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

    let result;
    try {
      result = await resolution.notifier.notify({ kind: "lead_created", lead: lead.data });
    } catch (error) {
      await run.record(leadId, "failed", errorDetail(error));
      throw error;
    }
    if (result.status === "skipped") {
      // Sin datos personales ni destinatarios: solo el motivo.
      deps.log.warn("agency.notify: aviso omitido", {
        action: "agency.notify",
        leadId,
        detail: result.reason,
      });
      return run.record(leadId, "skipped", result.reason);
    }
    await run.record(leadId, "succeeded");
  };
}

/** Envía eventos a la CAPI con el píxel y el token de la instancia; devuelve `events_received`. */
export type MetaCapiSender = (events: CapiLeadEvent[]) => Promise<number>;

function capiLogFields(error: MetaCapiError): ProviderLogFields {
  return {
    ...(error.status !== undefined && { status: error.status }),
    ...(error.code !== undefined && { code: error.code }),
    ...(error.subcode !== undefined && { subcode: error.subcode }),
    ...(error.fbtraceId !== undefined && { fbtrace_id: error.fbtraceId }),
  };
}

/**
 * `meta.capi.lead`: evento `Lead` a la Conversions API (ticket #17).
 * - Sin `attribution.eventId`: `skipped` (`no_event_id`).
 * - `em`/`ph` solo con consentimiento de marketing (`consents/{consentId}`); si el
 *   consentimiento no consta, se trata como no concedido.
 * - 5xx, 429, red o timeout: `failed` y re-lanza para que Cloud Tasks reintente. El
 *   reintento no duplica el evento en Meta: lleva el mismo `event_id`, con el que Meta
 *   deduplica.
 * - Otro 4xx: `failed` sin reintento.
 */
export function createMetaCapiLeadHandler(
  deps: LeadTaskDeps & { capi: () => MetaCapiSender },
): LeadTaskHandler {
  const run = taskRunner("meta.capi.lead", deps);
  return async (payload) => {
    const loaded = await run.load(payload);
    if (loaded === undefined) return;
    const { leadId, data } = loaded;

    const lead = TaskLead.safeParse(data);
    if (!lead.success) return run.record(leadId, "failed", "invalid_lead");
    if (
      lead.data.attribution.eventId === undefined ||
      lead.data.attribution.eventId.trim() === ""
    ) {
      return run.record(leadId, "skipped", "no_event_id");
    }

    const consentData = await deps.store.loadConsent(lead.data.consentId);
    const consent = consentData === null ? null : TaskConsent.safeParse(consentData);
    const built = buildCapiLeadEvent({
      attribution: lead.data.attribution,
      contact: lead.data.contact,
      createdAt: lead.data.createdAt,
      consent: consent?.success === true ? consent.data : null,
    });
    if ("skip" in built) return run.record(leadId, "skipped", built.skip);

    try {
      await deps.capi()([built.event]);
    } catch (error) {
      if (error instanceof MetaCapiError) {
        await run.record(leadId, "failed", error.detail, capiLogFields(error));
        if (error.transient) throw error;
        return;
      }
      await run.record(leadId, "failed", errorDetail(error));
      throw error;
    }
    await run.record(leadId, "succeeded");
  };
}
