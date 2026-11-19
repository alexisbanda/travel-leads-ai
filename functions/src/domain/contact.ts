import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalización de datos de contacto (docs/03-registro-de-leads.md, «Normalización»).
 *
 * Lógica pura: sin Firebase ni SDKs. La región telefónica nunca es una constante
 * del motor; en runtime sale de `market.phoneDefaultRegion` de la configuración
 * resuelta de la instancia.
 */

/** Límite de caracteres del texto libre que deja el viajero. */
export const FREE_TEXT_MAX_LENGTH = 1000;

/** Resultado de normalizar un teléfono. */
export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; error: "invalid_phone" };

/**
 * Convierte un teléfono a E.164. `region` es el código ISO 3166-1 alfa-2 que se
 * usa cuando el número no lleva prefijo internacional.
 */
export function normalizePhone(input: string, region: string): NormalizePhoneResult {
  const parsed = parsePhoneNumberFromString(input.trim(), region as CountryCode);
  if (parsed === undefined || !parsed.isValid()) {
    return { ok: false, error: "invalid_phone" };
  }
  return { ok: true, value: parsed.number };
}

/** Email: `trim().toLowerCase()`. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Nombre: recorta y colapsa los espacios internos. No inventa ni separa apellidos. */
export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * Texto libre: recorta y limita a `FREE_TEXT_MAX_LENGTH` caracteres sin partir
 * un par sustituto UTF-16.
 */
export function normalizeFreeText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length <= FREE_TEXT_MAX_LENGTH) return trimmed;
  let cut = trimmed.slice(0, FREE_TEXT_MAX_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}
