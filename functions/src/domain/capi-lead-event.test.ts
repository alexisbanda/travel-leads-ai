import { describe, expect, it } from "vitest";
import {
  buildCapiLeadEvent,
  hasMarketingConsent,
  normalizeCapiEmail,
  normalizeCapiPhone,
  type CapiLeadInput,
} from "./capi-lead-event.js";

// Datos ficticios: nunca datos reales de leads (AGENTS.md).
const EMAIL = "  QA@Example.TEST ";
const PHONE = "+9900000001"; // hardcoding-ok: teléfono ficticio de prueba
/** sha256("qa@example.test") */
const EMAIL_HASH = "603ba7ede2fef2a532e27f0bfcd60efbe67c1a0494f8756635779f4d8b56da7b";
/** sha256("9900000001") */
const PHONE_HASH = "5f0ba9fa3f1122ef13b944a40abfe44e7eba9e16934e64200913cb4c402ace14";
const CREATED_AT = new Date("2030-01-15T10:00:00.900Z");
const CREATED_AT_SECONDS = 1894701600;

function input(overrides: Partial<CapiLeadInput> = {}): CapiLeadInput {
  return {
    attribution: { eventId: "evt-ficticio-1", fbc: "fb.1.1.fbclid-ficticio", fbp: "fb.1.1.123" },
    contact: { email: EMAIL, phoneE164: PHONE },
    createdAt: CREATED_AT,
    consent: { purposes: ["contact", "marketing"] },
    ...overrides,
  };
}

function eventOf(lead: CapiLeadInput) {
  const result = buildCapiLeadEvent(lead);
  if (!("event" in result)) throw new Error("se esperaba un evento");
  return result.event;
}

describe("buildCapiLeadEvent", () => {
  it("lleva event_name Lead, event_id de la atribución, event_time en segundos y action_source", () => {
    const event = eventOf(input());
    expect(event.event_name).toBe("Lead");
    expect(event.event_id).toBe("evt-ficticio-1");
    expect(event.event_time).toBe(CREATED_AT_SECONDS);
    expect(Number.isInteger(event.event_time)).toBe(true);
    expect(event.action_source).toBe("website");
  });

  it("con consentimiento de marketing: em y ph normalizados y en SHA-256, con fbc y fbp", () => {
    expect(eventOf(input()).user_data).toEqual({
      em: [EMAIL_HASH],
      ph: [PHONE_HASH],
      fbc: "fb.1.1.fbclid-ficticio",
      fbp: "fb.1.1.123",
    });
  });

  it("sin consentimiento de marketing: sin em ni ph, pero con fbc y fbp", () => {
    const userData = eventOf(input({ consent: { purposes: ["contact"] } })).user_data;
    expect(userData).toEqual({ fbc: "fb.1.1.fbclid-ficticio", fbp: "fb.1.1.123" });
    expect(userData).not.toHaveProperty("em");
    expect(userData).not.toHaveProperty("ph");
  });

  it("consentimiento retirado o ausente: sin em ni ph", () => {
    const withdrawn = input({
      consent: { purposes: ["contact", "marketing"], withdrawnAt: CREATED_AT },
    });
    expect(eventOf(withdrawn).user_data).not.toHaveProperty("em");
    expect(eventOf(input({ consent: null })).user_data).not.toHaveProperty("ph");
  });

  it("sin consentimiento ni fbc/fbp: user_data vacío", () => {
    const event = eventOf(
      input({ attribution: { eventId: "evt-ficticio-1" }, consent: { purposes: ["contact"] } }),
    );
    expect(event.user_data).toEqual({});
  });

  it("con consentimiento pero sin fbc/fbp: solo em y ph", () => {
    const event = eventOf(input({ attribution: { eventId: "evt-ficticio-1" } }));
    expect(event.user_data).toEqual({ em: [EMAIL_HASH], ph: [PHONE_HASH] });
  });

  it("solo con teléfono: ph sin em", () => {
    const event = eventOf(input({ contact: { phoneE164: PHONE } }));
    expect(event.user_data).not.toHaveProperty("em");
    expect(event.user_data.ph).toEqual([PHONE_HASH]);
  });

  it.each([{}, { eventId: "" }, { eventId: "  ", fbc: "fb.1.1.x" }])(
    "sin eventId (%j): skip no_event_id",
    (attribution) => {
      expect(buildCapiLeadEvent(input({ attribution }))).toEqual({ skip: "no_event_id" });
    },
  );

  it("no añade IP, user agent, nombre ni otros campos", () => {
    const event = eventOf(input());
    expect(Object.keys(event).sort()).toEqual(
      ["action_source", "event_id", "event_name", "event_time", "user_data"].sort(),
    );
    expect(Object.keys(event.user_data).sort()).toEqual(["em", "fbc", "fbp", "ph"]);
  });
});

describe("normalización de Meta", () => {
  it("email: trim y minúsculas", () => {
    expect(normalizeCapiEmail(EMAIL)).toBe("qa@example.test");
  });

  it("teléfono: solo dígitos, sin +", () => {
    expect(normalizeCapiPhone(PHONE)).toBe("9900000001");
  });

  it("consentimiento de marketing", () => {
    expect(hasMarketingConsent({ purposes: ["contact", "marketing"] })).toBe(true);
    expect(hasMarketingConsent({ purposes: ["contact"] })).toBe(false);
    expect(hasMarketingConsent(null)).toBe(false);
  });
});
