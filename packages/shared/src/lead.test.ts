import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  Attribution,
  ConsentChannel,
  Consent,
  LandingLeadInput,
  Lead,
  LeadEvent,
  LEAD_TASK_EVENT_TYPES,
  LeadEventType,
  LeadSegment,
  LeadTaskAction,
  LeadTaskOutcome,
  LeadSource,
  LeadStatus,
  Sale,
} from "./lead.js";

// Datos ficticios evidentes: nunca datos reales de leads (AGENTS.md).
const LEAD_ID = "01J0000000000000000000000A";
const DEDUPE_KEY = "0".repeat(64);
const PHONE_E164 = "+600000000"; // hardcoding-ok: número ficticio de pruebas
const EMAIL = "prueba.qa@example.test";
const CURRENCY = Intl.supportedValuesOf("currency")[0] ?? "";
const AT = new Date("2026-01-01T00:00:00Z");

function issuePaths(schema: z.ZodTypeAny, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

function validLead(): Record<string, unknown> {
  return {
    leadId: LEAD_ID,
    dedupeKey: DEDUPE_KEY,
    source: "landing",
    status: "new",
    contact: {
      name: "Prueba QA",
      phoneE164: PHONE_E164,
      email: EMAIL,
      country: "YY",
      language: "xx-YY",
    },
    segment: "adventure",
    interest: {
      tourIds: ["tour-prueba"],
      travelMonth: "2027-03",
      flexibleDates: true,
      pax: { adults: 2, children: 0 },
      budgetRange: "1000-2000",
      notes: "Nota de prueba",
    },
    attribution: {
      utmSource: "prueba",
      utmMedium: "cpc",
      utmCampaign: "campana-prueba",
      fbclid: "fbclid-prueba",
      fbc: "fb.1.0.fbclid-prueba",
      fbp: "fb.1.0.0",
      landingSlug: "landing-prueba",
      eventId: "evento-prueba",
      firstTouchAt: AT,
    },
    consentId: "consent-prueba",
    assignedTo: "vendedor-prueba",
    crm: { contactId: "crm-contacto-prueba", dealId: "crm-deal-prueba" },
    sla: { firstResponseAt: AT },
    qualification: { score: 80, summary: "Resumen de prueba" },
    createdAt: AT,
    updatedAt: AT,
    retentionUntil: new Date("2028-01-01T00:00:00Z"),
  };
}

function validConsent(): Record<string, unknown> {
  return {
    leadId: LEAD_ID,
    purposes: ["contact", "marketing"],
    textVersion: "draft",
    channel: "landing",
    grantedAt: AT,
    ipHash: "a".repeat(64),
    userAgent: "agente-de-prueba",
  };
}

function validSale(): Record<string, unknown> {
  return {
    leadId: LEAD_ID,
    tourIds: ["tour-prueba"],
    amount: 3000,
    currency: CURRENCY,
    pax: { adults: 2, children: 1 },
    travelDate: new Date("2027-03-15T00:00:00Z"),
    closedAt: AT,
    commission: { rate: 0.1, amount: 300, status: "pending" },
    crmDealId: "crm-deal-prueba",
  };
}

function validLandingInput(): Record<string, unknown> {
  return {
    name: "Prueba QA",
    phone: "600000000",
    consent: { contact: true, textVersion: "draft" },
    landingSlug: "galapagos",
  };
}

describe("LeadStatus", () => {
  it("acepta un estado válido de la máquina de estados", () => {
    expect(LeadStatus.parse("qualified")).toBe("qualified");
  });

  it("rechaza un estado que no existe en la máquina de estados", () => {
    expect(() => LeadStatus.parse("unknown")).toThrow();
  });

  it("tiene exactamente los 9 estados de docs/02-modelo-de-datos.md", () => {
    expect(LeadStatus.options).toEqual([
      "new",
      "contacted",
      "unresponsive",
      "qualified",
      "handed_off",
      "quoted",
      "won",
      "lost",
      "invalid",
    ]);
  });
});

describe("enums de docs/02", () => {
  it("LeadSource admite solo landing, meta_lead_ad, whatsapp y manual", () => {
    expect(LeadSource.options).toEqual(["landing", "meta_lead_ad", "whatsapp", "manual"]);
  });

  it("LeadSegment tiene los segmentos de docs/02", () => {
    expect(LeadSegment.options).toEqual(["adventure", "couple", "senior", "diaspora", "other"]);
  });

  it("ConsentChannel admite landing, meta_form y whatsapp", () => {
    expect(ConsentChannel.options).toEqual(["landing", "meta_form", "whatsapp"]);
  });
});

describe("Lead", () => {
  it("acepta un lead completo", () => {
    expect(issuePaths(Lead, validLead())).toEqual([]);
  });

  it("acepta un lead mínimo sin campos opcionales", () => {
    const lead = validLead();
    for (const key of ["segment", "assignedTo", "crm", "sla", "qualification"]) delete lead[key];
    lead.contact = { name: "Prueba QA", email: EMAIL, country: "YY", language: "xx-YY" };
    lead.interest = { tourIds: [] };
    lead.attribution = {};
    expect(issuePaths(Lead, lead)).toEqual([]);
  });

  it("rechaza un source fuera de la lista", () => {
    expect(issuePaths(Lead, { ...validLead(), source: "email" })).toEqual(["source"]);
  });

  it("rechaza un contacto sin teléfono ni email", () => {
    const lead = validLead();
    lead.contact = { name: "Prueba QA", country: "YY", language: "xx-YY" };
    expect(issuePaths(Lead, lead)).toEqual(["contact.phoneE164"]);
  });

  it("rechaza un teléfono que no está en E.164", () => {
    const lead = validLead();
    lead.contact = { ...(lead.contact as object), phoneE164: "600000000" };
    expect(issuePaths(Lead, lead)).toEqual(["contact.phoneE164"]);
  });

  it("rechaza un leadId que no es ULID y un dedupeKey que no es SHA-256", () => {
    expect(issuePaths(Lead, { ...validLead(), leadId: "lead-1", dedupeKey: "abc" })).toEqual([
      "leadId",
      "dedupeKey",
    ]);
  });

  it("rechaza una puntuación de calificación fuera de 0–100", () => {
    expect(issuePaths(Lead, { ...validLead(), qualification: { score: 101 } })).toEqual([
      "qualification.score",
    ]);
  });

  it("rechaza marcas de tiempo que no son Date", () => {
    expect(issuePaths(Lead, { ...validLead(), createdAt: "2026-01-01" })).toEqual(["createdAt"]);
  });

  it("rechaza un travelMonth sin formato AAAA-MM y un budgetRange inválido", () => {
    const lead = validLead();
    lead.interest = { tourIds: [], travelMonth: "03/2027", budgetRange: "barato" };
    expect(issuePaths(Lead, lead)).toEqual(["interest.travelMonth", "interest.budgetRange"]);
  });
});

describe("Attribution", () => {
  it("acepta un objeto vacío y los identificadores de Meta y WhatsApp", () => {
    expect(issuePaths(Attribution, {})).toEqual([]);
    expect(
      issuePaths(Attribution, {
        ctwaClid: "ctwa-prueba",
        gclid: "gclid-prueba",
        metaAdId: "ad-prueba",
        metaAdsetId: "adset-prueba",
        metaCampaignId: "campaign-prueba",
      }),
    ).toEqual([]);
  });
});

describe("Consent", () => {
  it("acepta un consentimiento válido", () => {
    expect(issuePaths(Consent, validConsent())).toEqual([]);
  });

  it("acepta un consentimiento revocado sin evidencia de IP", () => {
    const consent = { ...validConsent(), purposes: ["contact"], withdrawnAt: AT };
    delete (consent as Record<string, unknown>).ipHash;
    expect(issuePaths(Consent, consent)).toEqual([]);
  });

  it("rechaza finalidades sin contact", () => {
    expect(issuePaths(Consent, { ...validConsent(), purposes: ["marketing"] })).toEqual([
      "purposes",
    ]);
  });

  it("rechaza finalidades duplicadas", () => {
    expect(issuePaths(Consent, { ...validConsent(), purposes: ["contact", "contact"] })).toEqual([
      "purposes",
    ]);
  });

  it("rechaza un canal desconocido", () => {
    expect(issuePaths(Consent, { ...validConsent(), channel: "email" })).toEqual(["channel"]);
  });
});

describe("LeadEvent", () => {
  it("acepta una transición de estado", () => {
    const event = { type: "status_changed", from: "new", to: "contacted", actor: "system", at: AT };
    expect(issuePaths(LeadEvent, event)).toEqual([]);
  });

  it("acepta eventos que no son transición sin from ni to", () => {
    expect(issuePaths(LeadEvent, { type: "created", actor: "system", at: AT })).toEqual([]);
    expect(issuePaths(LeadEvent, { type: "reengaged", actor: "system", at: AT })).toEqual([]);
  });

  it("rechaza estados fuera de la máquina, actor vacío y at que no es Date", () => {
    const event = { type: "status_changed", from: "new", to: "closed", actor: " ", at: "ayer" };
    expect(issuePaths(LeadEvent, event)).toEqual(["to", "actor", "at"]);
  });

  it("rechaza un tipo fuera de la lista cerrada", () => {
    expect(issuePaths(LeadEvent, { type: "Status Changed", actor: "system", at: AT })).toEqual([
      "type",
    ]);
    expect(issuePaths(LeadEvent, { type: "lead_merged", actor: "system", at: AT })).toEqual([
      "type",
    ]);
  });

  it("LeadEventType contiene created, reengaged, status_changed y los eventos de tareas", () => {
    expect(LeadEventType.options).toEqual([
      "created",
      "reengaged",
      "status_changed",
      "crm.upsert.succeeded",
      "crm.upsert.failed",
      "crm.upsert.skipped",
      "agency.notify.succeeded",
      "agency.notify.failed",
      "agency.notify.skipped",
      "meta.capi.lead.succeeded",
      "meta.capi.lead.failed",
      "meta.capi.lead.skipped",
    ]);
  });

  it("genera un tipo de evento por cada acción y resultado", () => {
    expect(LEAD_TASK_EVENT_TYPES).toHaveLength(
      LeadTaskAction.options.length * LeadTaskOutcome.options.length,
    );
    expect(LeadEventType.safeParse("crm.upsert").success).toBe(false);
    expect(LeadEventType.safeParse("crm.upsert.retried").success).toBe(false);
  });

  it("acepta un evento de tarea con detail", () => {
    const event = {
      type: "crm.upsert.skipped",
      actor: "system",
      at: AT,
      detail: "not_implemented",
    };
    expect(issuePaths(LeadEvent, event)).toEqual([]);
  });

  it("rechaza un detail con texto libre o demasiado largo", () => {
    const base = { type: "crm.upsert.failed", actor: "system", at: AT };
    expect(issuePaths(LeadEvent, { ...base, detail: "texto libre con espacios" })).toEqual([
      "detail",
    ]);
    expect(issuePaths(LeadEvent, { ...base, detail: "a".repeat(101) })).toEqual(["detail"]);
    expect(issuePaths(LeadEvent, { ...base, detail: "" })).toEqual(["detail"]);
  });

  it("acepta un reengaged con la atribución del nuevo envío", () => {
    const event = {
      type: "reengaged",
      actor: "system",
      at: AT,
      attribution: { utmSource: "newsletter", landingSlug: "otra-landing" },
    };
    expect(issuePaths(LeadEvent, event)).toEqual([]);
  });

  it("rechaza una atribución con campos inválidos", () => {
    const event = { type: "reengaged", actor: "system", at: AT, attribution: { landingSlug: 1 } };
    expect(issuePaths(LeadEvent, event)).toEqual(["attribution.landingSlug"]);
  });
});

describe("Sale", () => {
  it("acepta una venta válida", () => {
    expect(CURRENCY).not.toBe("");
    expect(issuePaths(Sale, validSale())).toEqual([]);
  });

  it("acepta los tres estados de comisión", () => {
    for (const status of ["pending", "invoiced", "paid"]) {
      const sale = { ...validSale(), commission: { rate: 0.1, amount: 300, status } };
      expect(issuePaths(Sale, sale)).toEqual([]);
    }
  });

  it("rechaza un estado de comisión desconocido, una tasa mayor que 1 y una moneda inválida", () => {
    const sale = {
      ...validSale(),
      currency: "XXXX",
      commission: { rate: 10, amount: 300, status: "refunded" },
    };
    expect(issuePaths(Sale, sale)).toEqual(["currency", "commission.rate", "commission.status"]);
  });
});

describe("LandingLeadInput", () => {
  it("acepta el ejemplo del ticket y rellena los valores por defecto", () => {
    const result = LandingLeadInput.safeParse(validLandingInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attribution).toEqual({});
    expect(result.data.tourIds).toEqual([]);
    expect(result.data.consent.marketing).toBe(false);
  });

  it("acepta los campos opcionales válidos", () => {
    const input = {
      ...validLandingInput(),
      email: EMAIL,
      travelMonth: "2027-03",
      pax: { adults: 2, children: 1 },
      tourIds: ["a", "b", "c", "d", "e"],
      attribution: { utmSource: "prueba", fbclid: "fbclid-prueba", eventId: "evento-prueba" },
      website: "",
    };
    expect(issuePaths(LandingLeadInput, input)).toEqual([]);
  });

  it.each([
    ["name", { name: "P" }],
    ["name", { name: " P " }],
    ["consent.contact", { consent: { contact: false, textVersion: "draft" } }],
    ["consent.contact", { consent: { textVersion: "draft" } }],
    ["tourIds", { tourIds: ["a", "b", "c", "d", "e", "f"] }],
    ["travelMonth", { travelMonth: "2027-3" }],
    ["travelMonth", { travelMonth: "marzo" }],
    ["website", { website: "https://spam.example.test" }],
  ])("rechaza %s con %j", (path, override) => {
    expect(issuePaths(LandingLeadInput, { ...validLandingInput(), ...override })).toEqual([path]);
  });
});
