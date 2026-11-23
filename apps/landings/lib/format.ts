import { DAY_PLACEHOLDER, PRICE_PLACEHOLDER } from "@tla/shared";
import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Formateo puro para la plantilla de landings. Ninguna función conoce
 * países, monedas ni idiomas: todo llega desde la configuración resuelta
 * (pack de mercado e instancia).
 */

export interface PriceFormatOptions {
  /** Locale del mercado (BCP 47). */
  locale: string;
  /** Moneda del mercado (ISO 4217). */
  currency: string;
  /** Plantilla `landingUi.priceFrom` del pack, con el marcador `{price}`. */
  template: string;
}

/** Texto «desde» del precio orientativo: formatea `from` con `Intl` y lo sustituye en la plantilla. */
export function formatPriceFrom(from: number, { locale, currency, template }: PriceFormatOptions): string {
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(from);
  return template.split(PRICE_PLACEHOLDER).join(price);
}

/** Etiqueta de día del itinerario: sustituye `{day}` en la plantilla `landingUi.dayLabel`. */
export function formatDay(day: number, template: string): string {
  return template.split(DAY_PLACEHOLDER).join(String(day));
}

/**
 * Enlace `wa.me` con el mensaje predefinido codificado. `undefined` si la
 * instancia no tiene número (p. ej. en `draft`).
 */
export function whatsappHref(number: string, prefill: string | undefined): string | undefined {
  const digits = number.replace(/\D/g, "");
  if (digits === "") return undefined;
  const base = `https://wa.me/${digits}`;
  return prefill === undefined ? base : `${base}?text=${encodeURIComponent(prefill)}`;
}

/**
 * Número E.164 en formato internacional legible. `region` (ISO 3166-1 alfa-2
 * del mercado) solo se usa si el número no trae prefijo. Vacío → `undefined`;
 * si no se puede interpretar, se devuelve tal cual.
 */
export function formatPhoneForMarket(e164: string, region: string | undefined): string | undefined {
  const trimmed = e164.trim();
  if (trimmed === "") return undefined;
  const defaultCountry = region !== undefined && isSupportedCountry(region) ? region : undefined;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  return parsed ? parsed.formatInternational() : trimmed;
}
