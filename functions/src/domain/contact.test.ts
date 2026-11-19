import { E164Phone } from "@tla/shared";
import { describe, expect, it } from "vitest";
import {
  FREE_TEXT_MAX_LENGTH,
  normalizeEmail,
  normalizeFreeText,
  normalizeName,
  normalizePhone,
} from "./contact.js";

// Región y números ficticios de prueba: el motor nunca fija la región, la recibe.
const REGION = "ES";
const PHONE_E164 = "+34600000000"; // hardcoding-ok: número ficticio de pruebas

describe("normalizePhone", () => {
  it("convierte un número nacional a E.164 con la región recibida", () => {
    expect(normalizePhone("600 00 00 00", REGION)).toEqual({ ok: true, value: PHONE_E164 });
  });

  it("respeta un número que ya viene en E.164", () => {
    expect(normalizePhone(PHONE_E164, REGION)).toEqual({ ok: true, value: PHONE_E164 });
  });

  it("produce un valor que cumple el esquema E164Phone", () => {
    const result = normalizePhone(" 600-000-000 ", REGION);
    expect(result.ok).toBe(true);
    if (result.ok) expect(E164Phone.safeParse(result.value).success).toBe(true);
  });

  it("rechaza números inválidos con invalid_phone", () => {
    expect(normalizePhone("123", REGION)).toEqual({ ok: false, error: "invalid_phone" });
    expect(normalizePhone("no es un teléfono", REGION)).toEqual({
      ok: false,
      error: "invalid_phone",
    });
    expect(normalizePhone("", REGION)).toEqual({ ok: false, error: "invalid_phone" });
  });

  it("no puede adivinar un número nacional con una región desconocida", () => {
    expect(normalizePhone("600 00 00 00", "ZZ")).toEqual({ ok: false, error: "invalid_phone" });
  });
});

describe("normalizeEmail", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizeEmail("  Prueba@Example.TEST ")).toBe("prueba@example.test");
  });
});

describe("normalizeName", () => {
  it("recorta y colapsa espacios internos", () => {
    expect(normalizeName("  Prueba   QA ")).toBe("Prueba QA");
    expect(normalizeName("Prueba\t\nQA")).toBe("Prueba QA");
  });
});

describe("normalizeFreeText", () => {
  it("expone el límite de 1.000 caracteres", () => {
    expect(FREE_TEXT_MAX_LENGTH).toBe(1000);
  });

  it("limita el texto a 1.000 caracteres", () => {
    expect(normalizeFreeText("a".repeat(1200))).toHaveLength(1000);
  });

  it("recorta espacios y deja intacto un texto corto", () => {
    expect(normalizeFreeText("  hola  ")).toBe("hola");
  });

  it("no parte un par sustituto en el límite", () => {
    const text = "a".repeat(FREE_TEXT_MAX_LENGTH - 1) + "😀" + "b";
    const result = normalizeFreeText(text);
    expect(result).toBe("a".repeat(FREE_TEXT_MAX_LENGTH - 1));
    expect(result.length).toBeLessThanOrEqual(FREE_TEXT_MAX_LENGTH);
  });
});
