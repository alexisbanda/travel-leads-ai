import type { AttributionInput } from "@tla/shared";

/**
 * Atribución de la visita leída de la query string, solo en memoria: no se
 * guarda en `localStorage`, `sessionStorage` ni cookies (la cookie de
 * atribución con consentimiento es #47).
 */

/** Lo único que necesitamos de `URLSearchParams`. */
export interface SearchParamsLike {
  get(name: string): string | null;
}

/** Longitud máxima de cada valor (la de `AttributionInput`). */
export const ATTRIBUTION_MAX_LENGTH = 500;

const PARAMS: ReadonlyArray<readonly [string, keyof AttributionInput]> = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
  ["fbclid", "fbclid"],
  ["gclid", "gclid"],
];

/** UTMs, `fbclid` y `gclid` presentes y no vacíos, recortados a 500 caracteres. */
export function readAttribution(searchParams: SearchParamsLike): AttributionInput {
  const attribution: AttributionInput = {};
  for (const [param, key] of PARAMS) {
    const value = searchParams.get(param)?.trim();
    if (value) attribution[key] = value.slice(0, ATTRIBUTION_MAX_LENGTH);
  }
  return attribution;
}
