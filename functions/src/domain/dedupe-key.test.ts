import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./contact.js";
import { dedupeKey } from "./dedupe-key.js";

const REGION = "ES";
const EMAIL = "prueba@example.test";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function phone(input: string): string {
  const result = normalizePhone(input, REGION);
  if (!result.ok) throw new Error("teléfono de prueba inválido");
  return result.value;
}

describe("dedupeKey", () => {
  it("da la misma clave para un teléfono escrito de dos formas, una vez normalizado", () => {
    const a = dedupeKey({ phoneE164: phone("600 00 00 00") });
    const b = dedupeKey({ phoneE164: phone("600-000-000") });
    expect(a).toBe(b);
    expect(a).toBe(sha256(phone("600000000")));
  });

  it("usa el teléfono antes que el email", () => {
    const phoneE164 = phone("600 00 00 00");
    expect(dedupeKey({ phoneE164, email: EMAIL })).toBe(sha256(phoneE164));
  });

  it("usa el email si no hay teléfono", () => {
    const key = dedupeKey({ email: normalizeEmail("  Prueba@Example.TEST ") });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(sha256(EMAIL));
  });

  it("falla si faltan teléfono y email", () => {
    expect(() => dedupeKey({})).toThrow();
    expect(() => dedupeKey({ email: "" })).toThrow();
  });
});
