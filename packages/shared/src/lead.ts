import { z } from "zod";

/**
 * Máquina de estados del lead (ver docs/02-modelo-de-datos.md).
 *
 * new -> contacted -> qualified -> handed_off -> quoted -> won | lost
 * new -> invalid
 * contacted -> unresponsive (sin respuesta 7 días)
 * unresponsive -> contacted (retoma)
 */
export const LeadStatus = z.enum([
  "new",
  "contacted",
  "unresponsive",
  "qualified",
  "handed_off",
  "quoted",
  "won",
  "lost",
  "invalid",
]);

export type LeadStatus = z.infer<typeof LeadStatus>;
