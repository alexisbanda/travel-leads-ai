import { randomBytes } from "node:crypto";

/**
 * Generador de ULID (https://github.com/ulid/spec): 10 caracteres de tiempo
 * (milisegundos, 48 bits) + 16 caracteres aleatorios, en base32 de Crockford.
 * Cumple el esquema `Ulid` de `@tla/shared`.
 *
 * Lógica pura: el reloj y la fuente aleatoria se pueden inyectar en los tests.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
/** Mayor instante representable con 48 bits. */
const MAX_TIME = 2 ** 48 - 1;

export function ulid(
  now: number = Date.now(),
  random: (size: number) => Uint8Array = randomBytes,
): string {
  if (!Number.isInteger(now) || now < 0 || now > MAX_TIME) {
    throw new Error("ulid: instante fuera de rango");
  }
  let time = "";
  let rest = now;
  for (let i = 0; i < TIME_LENGTH; i++) {
    time = ALPHABET[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  // 256 es múltiplo de 32: `byte & 31` es uniforme.
  const bytes = random(RANDOM_LENGTH);
  let suffix = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) suffix += ALPHABET[(bytes[i] ?? 0) & 31];
  return time + suffix;
}
