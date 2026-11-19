// Avisos internos (docs/specs/003-on-lead-created.md). Las implementaciones por canal
// se registran en `NOTIFIER_REGISTRY`; hoy solo email (#16).
import type { Lead, ResolvedInstanceConfig } from "@tla/shared";
import { notifyLocale } from "../../domain/notify-email.js";
import { createEmailNotifier } from "./email-notifier.js";

/** Canales de `agency.notify` (`NotifyChannel` de `@tla/shared`). */
export type NotifyChannelName = NonNullable<ResolvedInstanceConfig["agency"]["notify"]>["channel"];

/** Datos del lead que necesita el aviso. */
export type NotifyLeadInput = Pick<Lead, "leadId" | "source" | "contact" | "interest" | "crm">;

/**
 * Mensaje que envía un `Notifier`. Discriminado por `kind` para añadir otros avisos
 * (p. ej. los de SLA de #18) sin romper los existentes.
 */
export type NotifyMessage = { kind: "lead_created"; lead: NotifyLeadInput };

/** Resultado de un envío que no lanza: enviado u omitido con su motivo. */
export type NotifyResult = { status: "sent" } | { status: "skipped"; reason: "no_recipients" };

/** Envía un aviso interno. Lanza si el envío falla. */
export interface Notifier {
  notify(message: NotifyMessage): Promise<NotifyResult>;
}

/** `agency.notify` (o `partner.notify`) de la configuración resuelta. */
export interface NotifyTarget {
  channel: NotifyChannelName;
  /** Referencia `secret:NOMBRE` al destino. */
  target: string;
}

/** Lo que necesita un `Notifier` además de su destino. */
export interface NotifierContext {
  /** Idioma de los avisos: `agency.locale` o, si falta, el del mercado. */
  locale: string;
  /** Remitente de `channels.email.from`; vacío u omitido: el de la extensión. */
  from?: string | undefined;
  /** Valor del secreto de `target`; se lee al enviar, no al crear el notifier. */
  readTarget: () => string;
}

/** Crea el `Notifier` de un canal a partir de su destino. */
export type NotifierFactory = (target: NotifyTarget, context: NotifierContext) => Notifier;

/** Implementaciones disponibles por canal. */
export const NOTIFIER_REGISTRY: Partial<Record<NotifyChannelName, NotifierFactory>> = {
  email: (target, context) => createEmailNotifier(target, context),
};

/** Parte de la configuración resuelta que elige el aviso. */
export interface NotifierConfig {
  agency: { notify?: NotifyTarget | undefined; locale?: string | undefined };
  market: { locale: string };
  channels: { email?: { from: string } | undefined };
}

/** Resultado de elegir el aviso según la configuración. */
export type NotifierResolution =
  | { status: "ready"; channel: NotifyChannelName; notifier: Notifier }
  | { status: "no_channel" }
  | { status: "not_implemented"; channel: NotifyChannelName };

/**
 * Elige el `Notifier` según `agency.notify.channel`: `no_channel` si la instancia no
 * configura aviso y `not_implemented` si el canal aún no tiene implementación.
 */
export function notifierFor(
  config: NotifierConfig,
  readTarget: () => string,
  registry: Partial<Record<NotifyChannelName, NotifierFactory>> = NOTIFIER_REGISTRY,
): NotifierResolution {
  const notify = config.agency.notify;
  if (notify === undefined) return { status: "no_channel" };
  const factory = registry[notify.channel];
  if (factory === undefined) return { status: "not_implemented", channel: notify.channel };
  const notifier = factory(notify, {
    locale: notifyLocale(config),
    from: config.channels.email?.from,
    readTarget,
  });
  return { status: "ready", channel: notify.channel, notifier };
}
