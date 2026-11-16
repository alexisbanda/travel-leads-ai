import type { DestinationPack } from "@tla/shared";
import { ec } from "./ec/pack.js";

export { ec };

/**
 * Registro de packs de destino, indexado por código ISO 3166-1 alfa-2 en
 * mayúsculas (el mismo valor que `destination.country` en `instance.yaml`).
 */
export const destinationPacks: Readonly<Record<string, DestinationPack>> = Object.freeze({
  EC: ec,
});

/** Pack de destino de `country`, o `undefined` si no existe. */
export function getDestinationPack(country: string): DestinationPack | undefined {
  return Object.hasOwn(destinationPacks, country) ? destinationPacks[country] : undefined;
}
