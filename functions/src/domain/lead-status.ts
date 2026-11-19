import type { LeadStatus } from "@tla/shared";

/**
 * Máquina de estados del lead (diagrama de docs/02-modelo-de-datos.md).
 *
 * Lógica pura (sin Firebase ni SDKs externos). Mapa explícito de transiciones
 * permitidas: cualquier pareja que no figure aquí está prohibida.
 */
const TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  new: ["contacted", "invalid"],
  contacted: ["qualified", "unresponsive"],
  unresponsive: ["contacted"],
  qualified: ["handed_off"],
  handed_off: ["quoted"],
  quoted: ["won", "lost"],
  won: [],
  lost: [],
  invalid: [],
};

/** Indica si el diagrama de docs/02 permite pasar de `from` a `to`. */
export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Indica si un estado es terminal, es decir, no tiene transiciones salientes
 * en la máquina de estados.
 */
export function isTerminalStatus(status: LeadStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Un lead está abierto si no está en `won`, `lost` ni `invalid` (docs/03). */
export function isOpen(status: LeadStatus): boolean {
  return status !== "won" && status !== "lost" && status !== "invalid";
}
