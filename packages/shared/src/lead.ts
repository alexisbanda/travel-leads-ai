import { z } from "zod";

/**
 * Máquina de estados del lead (ver docs/02-modelo-de-datos.md).
 *
 * new -> contacted -> qualified -> handed_off -> quoted -> won | lost
 * new -> invalid
 */
export const LeadStatus = z.enum([
  "new",
  "contacted",
  "qualified",
  "handed_off",
  "quoted",
  "won",
  "lost",
  "invalid",
]);

export type LeadStatus = z.infer<typeof LeadStatus>;
