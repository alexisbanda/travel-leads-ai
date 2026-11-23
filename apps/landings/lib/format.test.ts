import { describe, expect, it } from "vitest";
import { formatDay, formatPhoneForMarket, formatPriceFrom, whatsappHref } from "./format.js";

const LOCALE = "es-ES"; // hardcoding-ok: valor de prueba
const CURRENCY = "EUR"; // hardcoding-ok: valor de prueba
const NUMBER = "+34600000000"; // hardcoding-ok: número ficticio de pruebas

/** Normaliza los espacios (Intl usa espacios no separables). */
const normalize = (text: string) => text.replace(/\s/g, " ");

describe("formatPriceFrom", () => {
  it("formatea con Intl (sin decimales) y sustituye {price} en la plantilla", () => {
    const text = formatPriceFrom(2490, { locale: LOCALE, currency: CURRENCY, template: "Desde {price} por persona" });
    expect(normalize(text)).toBe("Desde 2490 € por persona"); // hardcoding-ok: valor esperado de prueba
  });

  it("redondea los decimales", () => {
    const text = formatPriceFrom(1999.6, { locale: LOCALE, currency: CURRENCY, template: "{price}" });
    expect(normalize(text)).toBe("2000 €"); // hardcoding-ok: valor esperado de prueba
  });
});

describe("formatDay", () => {
  it("sustituye {day}", () => {
    expect(formatDay(3, "Día {day}")).toBe("Día 3");
  });
});

describe("whatsappHref", () => {
  it("devuelve el enlace wa.me con el mensaje codificado", () => {
    expect(whatsappHref(NUMBER, "Hola, ¿qué tal?")).toBe(
      "https://wa.me/34600000000?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F",
    );
  });

  it("sin mensaje, devuelve el enlace sin texto", () => {
    expect(whatsappHref(NUMBER, undefined)).toBe("https://wa.me/34600000000");
  });

  it("sin número, devuelve undefined", () => {
    expect(whatsappHref("", "Hola")).toBeUndefined();
    expect(whatsappHref("  ", "Hola")).toBeUndefined();
  });
});

describe("formatPhoneForMarket", () => {
  it("formatea un E.164 en formato internacional", () => {
    expect(formatPhoneForMarket(NUMBER, "ES")).toBe("+34 600 00 00 00"); // hardcoding-ok: valor esperado de prueba
  });

  it("vacío → undefined", () => {
    expect(formatPhoneForMarket("", "ES")).toBeUndefined();
  });

  it("si no se puede interpretar, lo devuelve tal cual", () => {
    expect(formatPhoneForMarket("abc", undefined)).toBe("abc");
  });
});
