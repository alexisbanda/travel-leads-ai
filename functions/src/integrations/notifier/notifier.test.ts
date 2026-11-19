import { describe, expect, it } from "vitest";
import { NOTIFIER_REGISTRY, notifierFor, type Notifier, type NotifierContext } from "./index.js";

// Locales de prueba: en runtime salen de la configuración resuelta.
const ES_LOCALE = "es-XX"; // hardcoding-ok: valor de prueba
const EN_LOCALE = "en-XX"; // hardcoding-ok: valor de prueba

const target = { channel: "email" as const, target: "secret:AGENCY_NOTIFY_TARGET" };
const market = { locale: ES_LOCALE };
const readTarget = () => "";

describe("notifierFor", () => {
  it("sin agency.notify → no_channel", () => {
    expect(notifierFor({ agency: {}, market, channels: {} }, readTarget)).toEqual({
      status: "no_channel",
    });
  });

  it("canal sin implementación → not_implemented", () => {
    expect(
      notifierFor({ agency: { notify: target }, market, channels: {} }, readTarget, {}),
    ).toEqual({ status: "not_implemented", channel: "email" });
  });

  it("canal registrado → ready con el notifier creado para su destino y su contexto", () => {
    const notifier: Notifier = { notify: async () => ({ status: "sent" }) };
    const seen: Array<[unknown, NotifierContext]> = [];
    const resolution = notifierFor(
      {
        agency: { notify: target, locale: EN_LOCALE },
        market,
        channels: { email: { from: "avisos@example.test" } },
      },
      readTarget,
      {
        email: (t, context) => {
          seen.push([t, context]);
          return notifier;
        },
      },
    );
    expect(resolution).toEqual({ status: "ready", channel: "email", notifier });
    expect(seen).toEqual([
      [target, { locale: EN_LOCALE, from: "avisos@example.test", readTarget }],
    ]);
  });

  it("sin agency.locale el contexto lleva el locale del mercado", () => {
    let locale = "";
    notifierFor({ agency: { notify: target }, market, channels: {} }, readTarget, {
      email: (_t, context) => {
        locale = context.locale;
        return { notify: async () => ({ status: "sent" }) };
      },
    });
    expect(locale).toBe(ES_LOCALE);
  });

  it("email está registrado", () => {
    expect(NOTIFIER_REGISTRY.email).toBeTypeOf("function");
  });
});
