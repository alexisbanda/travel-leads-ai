// Aviso a la agencia (docs/specs/003-on-lead-created.md). Las implementaciones por
// canal se registran en `NOTIFIER_REGISTRY`; el email llega en el ticket #16.
import type { Lead, ResolvedInstanceConfig } from "@tla/shared";

/** Canales de `agency.notify` (`NotifyChannel` de `@tla/shared`). */
export type NotifyChannelName = NonNullable<ResolvedInstanceConfig["agency"]["notify"]>["channel"];

/** Datos del lead que necesita el aviso. */
export type NotifyLeadInput = Pick<Lead, "leadId" | "source" | "contact" | "interest">;

/** Envía el aviso de un lead nuevo a la agencia. Lanza si el envío falla. */
export interface Notifier {
  notify(lead: NotifyLeadInput): Promise<void>;
}

/** `agency.notify` de la configuración resuelta. */
export interface NotifyTarget {
  channel: NotifyChannelName;
  /** Referencia `secret:NOMBRE` al destino. */
  target: string;
}

/** Crea el `Notifier` de un canal a partir de su destino. */
export type NotifierFactory = (target: NotifyTarget) => Notifier;

/** Implementaciones disponibles por canal. Vacío hasta #16 (email). */
export const NOTIFIER_REGISTRY: Partial<Record<NotifyChannelName, NotifierFactory>> = {};

/** Parte de la configuración resuelta que elige el aviso. */
export interface NotifierConfig {
  agency: { notify?: NotifyTarget | undefined };
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
  registry: Partial<Record<NotifyChannelName, NotifierFactory>> = NOTIFIER_REGISTRY,
): NotifierResolution {
  const notify = config.agency.notify;
  if (notify === undefined) return { status: "no_channel" };
  const factory = registry[notify.channel];
  if (factory === undefined) return { status: "not_implemented", channel: notify.channel };
  return { status: "ready", channel: notify.channel, notifier: factory(notify) };
}
