import type { LeadStatus } from "@tla/shared";

/**
 * Lógica pura (sin Firebase ni SDKs externos): indica si un estado del lead
 * es terminal, es decir, no tiene transiciones salientes en la máquina de
 * estados (ver docs/02-modelo-de-datos.md).
 */
export function isTerminalStatus(status: LeadStatus): boolean {
  return status === "won" || status === "lost" || status === "invalid";
}
