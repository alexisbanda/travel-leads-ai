// `slaWatchdog` (docs/specs/005-sla-watchdog.md, ticket #18): cada 5 minutos avisa al
// socio y luego a la agencia cuando un lead `new` no tiene primera respuesta, contando
// solo minutos dentro del horario de atención. Un aviso por lead y nivel: el aviso usa
// un id fijo y el lead se marca (`sla.warnedAt` / `sla.breachedAt`) tras avisar.
// Logs: solo `leadId`, nivel, resultado, `detail`, minutos y umbral; nunca contacto.
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  ConfigSla,
  Lead,
  SLA_EVENT_TYPES,
  type ResolvedInstanceConfig,
  type SlaLevel,
} from "@tla/shared";
import { errorDetail } from "../domain/lead-tasks.js";
import {
  businessMinutesBetween,
  SLA_MAX_CANDIDATES,
  slaCandidateWindow,
  slaLevelsDue,
} from "../domain/sla.js";
import { ulid } from "../domain/ulid.js";
import {
  notifierFor,
  type NotifierConfig,
  type NotifierResolution,
  type NotifyRecipient,
} from "../integrations/notifier/index.js";
import { secretName } from "../integrations/secrets.js";
import {
  createFirestoreSlaWatchdogStore,
  type SlaCandidate,
  type SlaWatchdogStore,
} from "./sla-watchdog-store.js";

export interface SlaLogFields {
  leadId?: string;
  level?: SlaLevel;
  outcome?: "sent" | "skipped" | "conflict" | "failed";
  detail?: string;
  businessMinutes?: number;
  thresholdMinutes?: number;
  candidates?: number;
  warned?: number;
  breached?: number;
  failed?: number;
}

export interface SlaLogger {
  info(message: string, fields: SlaLogFields): void;
  warn(message: string, fields: SlaLogFields): void;
  error(message: string, fields: SlaLogFields): void;
}

export interface SlaWatchdogDeps {
  store: SlaWatchdogStore;
  /** Aviso de cada destinatario: `partner` para `warning`, `agency` para `breach`. */
  notifier: (recipient: NotifyRecipient) => NotifierResolution;
  /** `config/sla` según la configuración resuelta, si el documento falta o no es válido. */
  fallbackSla: () => ConfigSla;
  now: () => Date;
  newId: () => string;
  log: SlaLogger;
}

/** Algunos leads no se pudieron procesar; se reintentan en la ejecución siguiente. */
export class SlaWatchdogError extends Error {
  override name = "SlaWatchdogError";
  constructor(readonly failed: number) {
    super(`slaWatchdog: ${failed} lead(s) con error`);
  }
}

/** Campos del lead que usa el SLA. */
const WatchLead = Lead.pick({
  leadId: true,
  source: true,
  status: true,
  contact: true,
  createdAt: true,
  sla: true,
});

const RECIPIENT: Record<SlaLevel, NotifyRecipient> = { warning: "partner", breach: "agency" };

async function loadSla(deps: SlaWatchdogDeps): Promise<ConfigSla> {
  const parsed = ConfigSla.safeParse(await deps.store.loadSlaConfig());
  if (parsed.success) return parsed.data;
  deps.log.error("slaWatchdog: config/sla ausente o inválido", { detail: "config_sla_fallback" });
  return deps.fallbackSla();
}

/** Avisa de un nivel; devuelve el `detail` si el aviso se omitió. Lanza si el envío falla. */
async function notifyLevel(
  deps: SlaWatchdogDeps,
  level: SlaLevel,
  lead: Pick<Lead, "leadId" | "source" | "contact">,
  businessMinutes: number,
  thresholdMinutes: number,
): Promise<string | undefined> {
  const resolution = deps.notifier(RECIPIENT[level]);
  if (resolution.status !== "ready") return resolution.status;
  const result = await resolution.notifier.notify({
    kind: "sla",
    level,
    lead: { leadId: lead.leadId, source: lead.source, contact: { name: lead.contact.name } },
    businessMinutes,
    thresholdMinutes,
  });
  return result.status === "skipped" ? result.reason : undefined;
}

type LeadOutcome = { warned: number; breached: number };

async function processCandidate(
  deps: SlaWatchdogDeps,
  sla: ConfigSla,
  now: Date,
  candidate: SlaCandidate,
): Promise<LeadOutcome> {
  const outcome: LeadOutcome = { warned: 0, breached: 0 };
  const { leadId } = candidate;
  const parsed = WatchLead.safeParse(candidate.data);
  if (!parsed.success) {
    // No se reintenta: el lead seguiría inválido en la ejecución siguiente.
    deps.log.error("slaWatchdog: lead inválido", {
      leadId,
      outcome: "failed",
      detail: "invalid_lead",
    });
    return outcome;
  }
  const lead = parsed.data;
  if (lead.status !== "new") return outcome;

  const businessMinutes = businessMinutesBetween(
    lead.createdAt,
    now,
    sla.businessHours,
    sla.timezone,
  );
  let version = candidate.version;
  for (const level of slaLevelsDue(businessMinutes, sla, lead.sla)) {
    const thresholdMinutes = level === "warning" ? sla.warnAfterMinutes : sla.breachAfterMinutes;
    const fields: SlaLogFields = { leadId, level, businessMinutes, thresholdMinutes };

    const detail = await notifyLevel(deps, level, lead, businessMinutes, thresholdMinutes);
    if (detail !== undefined) {
      deps.log.warn("slaWatchdog: aviso omitido", { ...fields, outcome: "skipped", detail });
    }

    const marked = await deps.store.markLevel(leadId, version, {
      level,
      at: now,
      eventId: deps.newId(),
      event: {
        type: SLA_EVENT_TYPES[level],
        actor: "system",
        at: now,
        ...(detail !== undefined && { detail }),
      },
    });
    if (marked.status === "conflict") {
      // El lead cambió desde la lectura: se vuelve a evaluar en la ejecución siguiente.
      deps.log.info("slaWatchdog: lead modificado, se reevalúa", {
        ...fields,
        outcome: "conflict",
      });
      return outcome;
    }
    version = marked.version;
    if (level === "warning") outcome.warned += 1;
    else outcome.breached += 1;
    if (detail === undefined)
      deps.log.info("slaWatchdog: aviso enviado", { ...fields, outcome: "sent" });
  }
  return outcome;
}

/** Una ejecución de `slaWatchdog`. Lanza `SlaWatchdogError` si algún lead falló. */
export function createSlaWatchdogHandler(deps: SlaWatchdogDeps): () => Promise<void> {
  return async () => {
    const now = deps.now();
    const sla = await loadSla(deps);
    const candidates = await deps.store.listCandidates({
      ...slaCandidateWindow(now, sla.warnAfterMinutes),
      limit: SLA_MAX_CANDIDATES,
    });

    const totals = { warned: 0, breached: 0, failed: 0 };
    for (const candidate of candidates) {
      try {
        const result = await processCandidate(deps, sla, now, candidate);
        totals.warned += result.warned;
        totals.breached += result.breached;
      } catch (error) {
        totals.failed += 1;
        deps.log.error("slaWatchdog: error con un lead", {
          leadId: candidate.leadId,
          outcome: "failed",
          detail: errorDetail(error),
        });
      }
    }

    deps.log.info("slaWatchdog: ejecución", { candidates: candidates.length, ...totals });
    if (totals.failed > 0) throw new SlaWatchdogError(totals.failed);
  };
}

/** Frecuencia de la ejecución (spec 005). */
export const SLA_WATCHDOG_SCHEDULE = "every 5 minutes";

type Secret = ReturnType<typeof defineSecret>;

/** Parte de la configuración resuelta que usa `slaWatchdog`. */
export type SlaWatchdogConfig = NotifierConfig & {
  sla: ResolvedInstanceConfig["sla"];
  market: Pick<ResolvedInstanceConfig["market"], "locale" | "businessHours" | "timezone">;
};

/** `config/sla` según la configuración resuelta: el respaldo si el documento falta. */
export function fallbackSlaConfig(config: SlaWatchdogConfig): ConfigSla {
  return ConfigSla.parse({
    warnAfterMinutes: config.sla.warnAfterMinutes,
    breachAfterMinutes: config.sla.breachAfterMinutes,
    businessHours: config.market.businessHours,
    timezone: config.market.timezone,
  });
}

/** Secretos `target` de los avisos por email, sin repetir; `undefined` si no hay aviso. */
export function slaNotifySecrets(
  config: NotifierConfig,
  define: (name: string) => Secret = defineSecret,
): Record<NotifyRecipient, Secret | undefined> {
  const byName = new Map<string, Secret>();
  const secretFor = (recipient: NotifyRecipient): Secret | undefined => {
    const notify = recipient === "agency" ? config.agency.notify : config.partner?.notify;
    if (notify?.channel !== "email") return undefined;
    const name = secretName(notify.target);
    const secret = byName.get(name) ?? define(name);
    byName.set(name, secret);
    return secret;
  };
  return { agency: secretFor("agency"), partner: secretFor("partner") };
}

/**
 * `onSchedule` de `slaWatchdog`. Ata el secreto `target` de `agency.notify` y de
 * `partner.notify` cuando su canal es email; sin aviso, ese nivel se omite.
 */
export function createSlaWatchdogFunction(config: SlaWatchdogConfig) {
  const targets = slaNotifySecrets(config);
  const secrets = [...new Set([targets.agency, targets.partner])].filter(
    (secret): secret is Secret => secret !== undefined,
  );

  const handler = createSlaWatchdogHandler({
    store: createFirestoreSlaWatchdogStore(),
    notifier: (recipient) =>
      notifierFor(
        config,
        () => {
          const secret = targets[recipient];
          if (secret === undefined) throw new Error(`${recipient}.notify.target no está atado`);
          return secret.value();
        },
        undefined,
        recipient,
      ),
    // Perezoso: la configuración solo se valida si `config/sla` falta en una ejecución.
    fallbackSla: () => fallbackSlaConfig(config),
    now: () => new Date(),
    newId: () => ulid(),
    // Acceso perezoso a `logger`: no se resuelve al definir la función.
    log: {
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warn(message, fields),
      error: (message, fields) => logger.error(message, fields),
    },
  });

  return onSchedule(
    {
      schedule: SLA_WATCHDOG_SCHEDULE,
      retryCount: 0,
      timeoutSeconds: 120,
      ...(secrets.length > 0 && { secrets }),
    },
    () => handler(),
  );
}
