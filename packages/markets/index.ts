import type { MarketPack } from "@tla/shared";
import { es } from "./es/pack.js";

export { es };

/**
 * Marcador de plantilla de `aiDisclosure.text`: se sustituye por
 * `brand.displayName` de la instancia al resolver la configuración.
 */
export const AI_DISCLOSURE_BRAND_PLACEHOLDER = "{brand}";

/**
 * Registro de packs de mercado, indexado por código ISO 3166-1 alfa-2 en
 * mayúsculas (el mismo valor que `market.country` en `instance.yaml`).
 */
export const marketPacks: Readonly<Record<string, MarketPack>> = Object.freeze({
  ES: es,
});

/** Pack de mercado de `country`, o `undefined` si no existe. */
export function getMarketPack(country: string): MarketPack | undefined {
  return Object.hasOwn(marketPacks, country) ? marketPacks[country] : undefined;
}
