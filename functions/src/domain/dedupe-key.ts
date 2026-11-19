import { createHash } from "node:crypto";

/**
 * Clave de deduplicación de personas (docs/03-registro-de-leads.md):
 * `dedupeKey = sha256(phoneE164 ?? email)` en hexadecimal.
 *
 * Lógica pura. Espera valores ya normalizados (ver `contact.ts`).
 */
export function dedupeKey(contact: { phoneE164?: string; email?: string }): string {
  const source = contact.phoneE164 ?? contact.email;
  if (source === undefined || source === "") {
    throw new Error("dedupeKey necesita phoneE164 o email");
  }
  return createHash("sha256").update(source, "utf8").digest("hex");
}
