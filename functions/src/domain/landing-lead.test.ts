import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Consent, LandingLeadInput, Lead, LeadEvent, type LeadStatus } from "@tla/shared";
import { describe, expect, it } from "vitest";
import {
  REENGAGE_WINDOW_DAYS,
  addMonthsUtc,
  buildNewLandingLead,
  buildReengagedEvent,
  hashIp,
  isReengageable,
  phoneCountry,
  type NewLandingLeadContext,
} from "./landing-lead.js";

// Valores ficticios de prueba: el motor recibe país, idioma y retención de la configuración.
const MARKET_COUNTRY = "ES";
const LOCALE = "es-ES"; // hardcoding-ok: valor de prueba, en runtime sale de la configuración
const PHONE_E164 = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
const IP = "192.0.2.10"; // TEST-NET-1 (RFC 5737)
const NOW = new Date("2030-01-15T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ID = (n: number) => `01ARZ3NDEKTSV4RRFFQ69G5FA${n}`;

function input(overrides: Record<string, unknown> = {}): LandingLeadInput {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../test/fixtures/landing-lead-valid.json", import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
  return LandingLeadInput.parse({ ...raw, ...overrides });
}

function ctx(overrides: Partial<NewLandingLeadContext> = {}): NewLandingLeadContext {
  return {
    ids: { leadId: ID(1), consentId: ID(2), eventId: ID(3) },
    phoneE164: PHONE_E164,
    email: "prueba.qa@example.com",
    dedupeKey: "a".repeat(64),
    now: NOW,
    marketCountry: MARKET_COUNTRY,
    locale: LOCALE,
    dataRetentionMonths: 24,
    ipHash: hashIp(IP, "salt-de-prueba"),
    userAgent: "agente-de-prueba",
    ...overrides,
  };
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value instanceof Date || value === null || typeof value !== "object") return false;
  return Object.values(value).some(hasUndefined);
}

describe("isReengageable", () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

  it("reutiliza un lead abierto de hace 30 días", () => {
    expect(isReengageable({ status: "new", createdAt: daysAgo(30) }, NOW)).toBe(true);
    expect(isReengageable({ status: "quoted", createdAt: daysAgo(30) }, NOW)).toBe(true);
  });

  it("la ventana es de 90 días, sin incluir el límite", () => {
    expect(REENGAGE_WINDOW_DAYS).toBe(90);
    expect(isReengageable({ status: "new", createdAt: daysAgo(89.99) }, NOW)).toBe(true);
    expect(isReengageable({ status: "new", createdAt: daysAgo(90) }, NOW)).toBe(false);
    expect(isReengageable({ status: "new", createdAt: daysAgo(120) }, NOW)).toBe(false);
  });

  it.each<LeadStatus>(["won", "lost", "invalid"])("no reutiliza un lead %s", (status) => {
    expect(isReengageable({ status, createdAt: daysAgo(1) }, NOW)).toBe(false);
  });
});

describe("addMonthsUtc", () => {
  it("suma meses conservando día y hora", () => {
    expect(addMonthsUtc(NOW, 24).toISOString()).toBe("2032-01-15T10:00:00.000Z");
  });

  it("ajusta al último día del mes si el día no existe", () => {
    expect(addMonthsUtc(new Date("2030-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2030-02-28T00:00:00.000Z",
    );
    expect(addMonthsUtc(new Date("2032-02-29T12:00:00Z"), 24).toISOString()).toBe(
      "2034-02-28T12:00:00.000Z",
    );
  });
});

describe("hashIp", () => {
  it("es SHA-256 hex, estable y depende del salt", () => {
    const hash = hashIp(IP, "salt-a");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIp(IP, "salt-a")).toBe(hash);
    expect(hashIp(IP, "salt-b")).not.toBe(hash);
    expect(hash).not.toContain(IP);
  });

  it("exige salt", () => {
    expect(() => hashIp(IP, "")).toThrow(/salt/);
  });
});

describe("phoneCountry", () => {
  it("deduce el país del número y, si no puede, usa el del mercado", () => {
    expect(phoneCountry(PHONE_E164, "ZZ")).toBe(MARKET_COUNTRY);
    expect(phoneCountry("no-es-un-telefono", "ZZ")).toBe("ZZ");
  });
});

describe("buildNewLandingLead", () => {
  it("construye lead, consentimiento, dedupe y evento created válidos", () => {
    const docs = buildNewLandingLead(input(), ctx());
    expect(Lead.safeParse(docs.lead).success).toBe(true);
    expect(Consent.safeParse(docs.consent).success).toBe(true);
    expect(LeadEvent.safeParse(docs.event).success).toBe(true);
    expect(hasUndefined(docs)).toBe(false);

    expect(docs.leadId).toBe(ID(1));
    expect(docs.lead).toMatchObject({
      source: "landing",
      status: "new",
      consentId: ID(2),
      contact: {
        name: "Prueba QA",
        phoneE164: PHONE_E164,
        email: "prueba.qa@example.com",
        country: MARKET_COUNTRY,
        language: LOCALE,
      },
      interest: {
        tourIds: ["tour-ficticio-1"],
        travelMonth: "2031-03",
        pax: { adults: 2, children: 0 },
      },
      attribution: { utmSource: "facebook", landingSlug: "landing-qa-1", firstTouchAt: NOW },
    });
    expect(docs.lead.retentionUntil.toISOString()).toBe("2032-01-15T10:00:00.000Z");
    expect(docs.consent).toMatchObject({
      leadId: ID(1),
      purposes: ["contact", "marketing"],
      textVersion: "1.0.0",
      channel: "landing",
      grantedAt: NOW,
      ipHash: hashIp(IP, "salt-de-prueba"),
      userAgent: "agente-de-prueba",
    });
    expect(docs.dedupe).toEqual({ leadId: ID(1), createdAt: NOW });
    expect(docs.eventId).toBe(ID(3));
    expect(docs.event).toEqual({ type: "created", actor: "system", at: NOW });
  });

  it("usa los meses de retención de la configuración", () => {
    const docs = buildNewLandingLead(input(), ctx({ dataRetentionMonths: 12 }));
    expect(docs.lead.retentionUntil.toISOString()).toBe("2031-01-15T10:00:00.000Z");
  });

  it("omite los opcionales ausentes sin dejar undefined", () => {
    const docs = buildNewLandingLead(
      input({ email: undefined, travelMonth: undefined, pax: undefined, attribution: undefined }),
      ctx({ email: undefined, ipHash: undefined, userAgent: undefined }),
    );
    expect(hasUndefined(docs)).toBe(false);
    expect(docs.lead.contact).not.toHaveProperty("email");
    expect(docs.lead.interest).toEqual({ tourIds: ["tour-ficticio-1"] });
    expect(docs.lead.attribution).toEqual({ landingSlug: "landing-qa-1", firstTouchAt: NOW });
    expect(docs.consent).not.toHaveProperty("ipHash");
    expect(docs.consent).not.toHaveProperty("userAgent");
    expect(Lead.safeParse(docs.lead).success).toBe(true);
  });

  it("sin marketing solo registra la finalidad contact", () => {
    const docs = buildNewLandingLead(
      input({ consent: { contact: true, marketing: false, textVersion: "1.0.0" } }),
      ctx(),
    );
    expect(docs.consent.purposes).toEqual(["contact"]);
  });
});

describe("buildReengagedEvent", () => {
  it("guarda la atribución del nuevo envío con su landingSlug", () => {
    const event = buildReengagedEvent(
      input({ landingSlug: "otra-landing", attribution: { utmSource: "newsletter" } }),
      NOW,
    );
    expect(LeadEvent.safeParse(event).success).toBe(true);
    expect(event).toEqual({
      type: "reengaged",
      actor: "system",
      at: NOW,
      attribution: { utmSource: "newsletter", landingSlug: "otra-landing" },
    });
  });
});
