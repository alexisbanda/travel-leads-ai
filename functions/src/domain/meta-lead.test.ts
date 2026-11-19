import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Consent, Lead, LeadEvent, type LeadFormFieldMap } from "@tla/shared";
import { describe, expect, it } from "vitest";
import { dedupeKey } from "./dedupe-key.js";
import {
  buildMetaLeadIngest,
  mapLeadFormFields,
  parseMetaGraphLead,
  parseMetaTime,
  type MetaLeadContext,
  type MetaLeadSettings,
} from "./meta-lead.js";

// Valores ficticios de prueba: en runtime salen de la configuración resuelta.
const PHONE_E164 = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
const NOW = new Date("2030-01-15T10:00:00.000Z");
const ID = (n: number) => `01ARZ3NDEKTSV4RRFFQ69G5FA${n}`;

const FIELD_MAP: LeadFormFieldMap = {
  cuando_quieres_viajar: { field: "travelMonth", values: { marzo_2027: "2027-03" } },
  cuantos_adultos: "paxAdults",
  tipo_de_viaje: { field: "segment", values: { en_pareja: "couple" } },
  comentarios: "notes",
  quiere_ofertas: { field: "marketingConsent", values: { si: true, no: false } },
};

const SETTINGS: MetaLeadSettings = {
  phoneDefaultRegion: "ES",
  marketCountry: "ES",
  locale: "es-ES", // hardcoding-ok: valor de prueba
  dataRetentionMonths: 24,
  legalTextsVersion: "1.0.0",
  fieldMap: FIELD_MAP,
};

function graphLead(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../test/fixtures/meta-graph-lead.json", import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

type FieldData = { name: string; values: string[] }[];

function withFields(edit: (fields: FieldData) => FieldData): Record<string, unknown> {
  const raw = graphLead();
  return { ...raw, field_data: edit(raw.field_data as FieldData) };
}

function without(...names: string[]) {
  return withFields((fields) => fields.filter((f) => !names.includes(f.name)));
}

function replacing(name: string, values: string[]) {
  return withFields((fields) => fields.map((f) => (f.name === name ? { name, values } : f)));
}

function ctx(settings: Partial<MetaLeadSettings> = {}): MetaLeadContext {
  return {
    ids: { leadId: ID(1), consentId: ID(2), eventId: ID(3), reengagedEventId: ID(4) },
    now: NOW,
    settings: { ...SETTINGS, ...settings },
  };
}

function build(raw: unknown, settings: Partial<MetaLeadSettings> = {}) {
  const result = buildMetaLeadIngest(raw, ctx(settings));
  if (!result.ok) throw new Error(`se esperaba ok: ${result.error}`);
  return result;
}

describe("parseMetaGraphLead", () => {
  it("lee ids, fecha y field_data", () => {
    const lead = parseMetaGraphLead(graphLead());
    expect(lead).toMatchObject({
      createdTime: "2030-01-14T09:30:00+0000",
      adId: "000000000000200",
      adsetId: "000000000000300",
      campaignId: "000000000000500",
      formId: "000000000000400",
    });
    expect(lead?.fieldData).toHaveLength(8);
  });

  it("admite ids ausentes y field_data vacío", () => {
    expect(parseMetaGraphLead({})).toEqual({ fieldData: [] });
  });

  it.each([
    ["no es objeto", "texto"],
    ["array", []],
    ["id no textual", { ad_id: 123 }],
    ["field_data no es array", { field_data: {} }],
    ["campo sin nombre", { field_data: [{ values: ["x"] }] }],
    ["valores no textuales", { field_data: [{ name: "email", values: [1] }] }],
  ])("rechaza %s", (_, raw) => {
    expect(parseMetaGraphLead(raw)).toBeUndefined();
  });
});

describe("parseMetaTime", () => {
  it("entiende el desfase sin dos puntos de la Graph API", () => {
    expect(parseMetaTime("2030-01-14T09:30:00+0000")?.toISOString()).toBe(
      "2030-01-14T09:30:00.000Z",
    );
    expect(parseMetaTime("2030-01-14T11:30:00+0200")?.toISOString()).toBe(
      "2030-01-14T09:30:00.000Z",
    );
  });

  it.each([undefined, "", "ayer", "2030-13-45T99:00:00+0000"])("devuelve undefined: %s", (v) => {
    expect(parseMetaTime(v)).toBeUndefined();
  });
});

describe("mapLeadFormFields", () => {
  it("mapea forma corta y forma con values", () => {
    const { fields, discardedKeys } = mapLeadFormFields(
      [
        { name: "cuando_quieres_viajar", values: ["marzo_2027"] },
        { name: "cuantos_adultos", values: ["2"] },
        { name: "tipo_de_viaje", values: ["en_pareja"] },
        { name: "comentarios", values: [" uno ", "dos"] },
        { name: "quiere_ofertas", values: ["no"] },
        { name: "sin_mapear", values: ["x"] },
      ],
      FIELD_MAP,
    );
    expect(fields).toEqual({
      travelMonth: "2027-03",
      paxAdults: 2,
      segment: "couple",
      notes: "uno, dos",
      marketingConsent: false,
    });
    expect(discardedKeys).toEqual([]);
  });

  it("convierte la forma corta al tipo del destino", () => {
    const { fields } = mapLeadFormFields(
      [
        { name: "mes", values: ["2027-05"] },
        { name: "ninos", values: ["0"] },
        { name: "presupuesto", values: ["1000-2000"] },
        { name: "acepta", values: ["TRUE"] },
      ],
      {
        mes: "travelMonth",
        ninos: "paxChildren",
        presupuesto: "budgetRange",
        acepta: "marketingConsent",
      },
    );
    expect(fields).toEqual({
      travelMonth: "2027-05",
      paxChildren: 0,
      budgetRange: "1000-2000",
      marketingConsent: true,
    });
  });

  it.each([
    ["travelMonth", "marzo"],
    ["paxAdults", "dos"],
    ["paxAdults", "0"],
    ["paxChildren", "-1"],
    ["budgetRange", "barato"],
    ["segment", "familia"],
    ["marketingConsent", "quizá"],
    ["notes", "   "],
  ] as const)(
    "descarta un valor que no valida contra %s (%s) y devuelve solo la clave",
    (field, answer) => {
      const { fields, discardedKeys } = mapLeadFormFields(
        [{ name: "pregunta", values: [answer] }],
        {
          pregunta: field,
        },
      );
      expect(fields).toEqual({});
      expect(discardedKeys).toEqual(["pregunta"]);
    },
  );

  it("descarta una respuesta que no está en values", () => {
    const { fields, discardedKeys } = mapLeadFormFields(
      [{ name: "cuando_quieres_viajar", values: ["otra_fecha"] }],
      FIELD_MAP,
    );
    expect(fields).toEqual({});
    expect(discardedKeys).toEqual(["cuando_quieres_viajar"]);
  });

  it("descarta una pregunta mapeada sin respuesta", () => {
    const { discardedKeys } = mapLeadFormFields([{ name: "comentarios", values: [] }], FIELD_MAP);
    expect(discardedKeys).toEqual(["comentarios"]);
  });

  it("si dos preguntas van al mismo destino se queda con la primera; notes se acumula", () => {
    const { fields, discardedKeys } = mapLeadFormFields(
      [
        { name: "mes_a", values: ["2027-01"] },
        { name: "mes_b", values: ["2027-02"] },
        { name: "nota_a", values: ["a"] },
        { name: "nota_b", values: ["b"] },
      ],
      { mes_a: "travelMonth", mes_b: "travelMonth", nota_a: "notes", nota_b: "notes" },
    );
    expect(fields).toEqual({ travelMonth: "2027-01", notes: "a\nb" });
    expect(discardedKeys).toEqual(["mes_b"]);
  });

  it("no confunde claves heredadas de Object con preguntas", () => {
    const { fields, discardedKeys } = mapLeadFormFields(
      [{ name: "toString", values: ["x"] }],
      FIELD_MAP,
    );
    expect(fields).toEqual({});
    expect(discardedKeys).toEqual([]);
  });
});

describe("buildMetaLeadIngest", () => {
  it("construye lead, consentimiento, dedupe y eventos que cumplen los esquemas", () => {
    const { ingest, discardedKeys } = build(graphLead());
    const { newLead } = ingest;
    expect(discardedKeys).toEqual([]);
    expect(ingest.dedupeKey).toBe(dedupeKey({ phoneE164: PHONE_E164 }));

    expect(Lead.parse(newLead.lead)).toEqual(newLead.lead);
    expect(newLead.lead).toEqual({
      leadId: ID(1),
      dedupeKey: ingest.dedupeKey,
      source: "meta_lead_ad",
      status: "new",
      contact: {
        name: "Viajero Prueba",
        phoneE164: PHONE_E164,
        email: "viajero.prueba@example.com",
        country: "ES",
        language: "es-ES", // hardcoding-ok: valor de prueba
      },
      segment: "couple",
      interest: {
        tourIds: [],
        travelMonth: "2027-03",
        pax: { adults: 2, children: 0 },
        notes: "Texto de prueba",
      },
      attribution: {
        metaCampaignId: "000000000000500",
        metaAdsetId: "000000000000300",
        metaAdId: "000000000000200",
        firstTouchAt: new Date("2030-01-14T09:30:00.000Z"),
      },
      consentId: ID(2),
      createdAt: NOW,
      updatedAt: NOW,
      retentionUntil: new Date("2032-01-15T10:00:00.000Z"),
    });

    expect(Consent.parse(newLead.consent)).toEqual(newLead.consent);
    expect(newLead.consent).toEqual({
      leadId: ID(1),
      purposes: ["contact", "marketing"],
      textVersion: "1.0.0",
      channel: "meta_form",
      grantedAt: NOW,
    });
    expect(newLead.dedupe).toEqual({ leadId: ID(1), createdAt: NOW });
    expect(newLead.eventId).toBe(ID(3));
    expect(LeadEvent.parse(newLead.event)).toEqual({ type: "created", actor: "system", at: NOW });

    expect(ingest.reengaged.eventId).toBe(ID(4));
    expect(LeadEvent.parse(ingest.reengaged.event)).toEqual({
      type: "reengaged",
      actor: "system",
      at: NOW,
      attribution: {
        metaCampaignId: "000000000000500",
        metaAdsetId: "000000000000300",
        metaAdId: "000000000000200",
      },
    });
  });

  it("solo la finalidad contact si no hay consentimiento de marketing", () => {
    expect(build(without("quiere_ofertas")).ingest.newLead.consent.purposes).toEqual(["contact"]);
    expect(build(replacing("quiere_ofertas", ["no"])).ingest.newLead.consent.purposes).toEqual([
      "contact",
    ]);
  });

  it("sin fieldMap ignora las preguntas personalizadas", () => {
    const { ingest } = build(graphLead(), { fieldMap: {} });
    expect(ingest.newLead.lead.interest).toEqual({ tourIds: [] });
    expect(ingest.newLead.lead.segment).toBeUndefined();
  });

  it("une first_name y last_name si no hay full_name", () => {
    const raw = withFields((fields) => [
      ...fields.filter((f) => f.name !== "full_name"),
      { name: "first_name", values: ["Viajero"] },
      { name: "last_name", values: ["Prueba"] },
    ]);
    expect(build(raw).ingest.newLead.lead.contact.name).toBe("Viajero Prueba");
  });

  it("con teléfono inválido usa el email y descarta phone_number", () => {
    const { ingest, discardedKeys } = build(replacing("phone_number", ["123"]));
    expect(ingest.newLead.lead.contact.phoneE164).toBeUndefined();
    expect(ingest.newLead.lead.contact.country).toBe("ES");
    expect(ingest.dedupeKey).toBe(dedupeKey({ email: "viajero.prueba@example.com" }));
    expect(discardedKeys).toEqual(["phone_number"]);
  });

  it("con email inválido usa el teléfono y descarta email", () => {
    const { ingest, discardedKeys } = build(replacing("email", ["no-es-un-email"]));
    expect(ingest.newLead.lead.contact.email).toBeUndefined();
    expect(discardedKeys).toEqual(["email"]);
  });

  it.each([
    ["sin teléfono ni email", () => without("phone_number", "email")],
    [
      "teléfono y email inválidos",
      () =>
        withFields((fields) =>
          fields.map((f) =>
            f.name === "phone_number" || f.name === "email" ? { name: f.name, values: ["x"] } : f,
          ),
        ),
    ],
    ["sin nombre", () => without("full_name")],
  ])("devuelve invalid_lead_data: %s", (_, raw) => {
    const result = buildMetaLeadIngest(raw(), ctx());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe("invalid_lead_data");
  });

  it("descarta paxChildren si no hay paxAdults", () => {
    const raw = withFields((fields) => [
      ...fields.filter((f) => f.name !== "cuantos_adultos"),
      { name: "cuantos_ninos", values: ["1"] },
    ]);
    const { ingest, discardedKeys } = build(raw, {
      fieldMap: { ...FIELD_MAP, cuantos_ninos: "paxChildren" },
    });
    expect(ingest.newLead.lead.interest.pax).toBeUndefined();
    expect(discardedKeys).toEqual(["cuantos_ninos"]);
  });

  it("usa paxChildren junto a paxAdults", () => {
    const raw = withFields((fields) => [...fields, { name: "cuantos_ninos", values: ["1"] }]);
    const { ingest } = build(raw, { fieldMap: { ...FIELD_MAP, cuantos_ninos: "paxChildren" } });
    expect(ingest.newLead.lead.interest.pax).toEqual({ adults: 2, children: 1 });
  });

  it("sin ids de anuncio ni fecha: atribución mínima con firstTouchAt = ahora", () => {
    const raw = graphLead();
    delete raw.ad_id;
    delete raw.adset_id;
    delete raw.campaign_id;
    delete raw.created_time;
    const { ingest } = build(raw);
    expect(ingest.newLead.lead.attribution).toEqual({ firstTouchAt: NOW });
    expect(ingest.reengaged.event.attribution).toEqual({});
  });

  it.each(["", "versión con espacios"])("devuelve invalid_text_version con %j", (version) => {
    const result = buildMetaLeadIngest(graphLead(), ctx({ legalTextsVersion: version }));
    expect(result).toEqual({ ok: false, error: "invalid_text_version", discardedKeys: [] });
  });

  it("devuelve graph_api_invalid_response si la respuesta no tiene la forma esperada", () => {
    const result = buildMetaLeadIngest({ field_data: "x" }, ctx());
    expect(result).toEqual({ ok: false, error: "graph_api_invalid_response", discardedKeys: [] });
  });
});
