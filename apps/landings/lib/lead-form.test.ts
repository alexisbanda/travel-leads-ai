import { LandingLeadInput } from "@tla/shared";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { describe, expect, it, vi } from "vitest";
import { readAttribution } from "./attribution.js";
import {
  buildLeadBody,
  EMPTY_LEAD_FORM_VALUES,
  submitLead,
  validateLeadForm,
  type LeadFormValues,
} from "./lead-form.js";
import { BASE_RESOLVED_INSTANCE } from "./test-fixtures.js";

const texts = BASE_RESOLVED_INSTANCE.marketPack.landingUi.form;
const legalTexts = BASE_RESOLVED_INSTANCE.marketPack.legalTexts;
const phoneDefaultRegion = BASE_RESOLVED_INSTANCE.market.phoneDefaultRegion;
/** Número ficticio de la fixture (E.164) y su forma nacional, sin prefijo. */
const FAKE_E164 = BASE_RESOLVED_INSTANCE.channels.whatsapp.number;
const FAKE_NATIONAL = parsePhoneNumberFromString(FAKE_E164)!.formatNational();
const EVENT_ID = "0b9f6c1e-3f4a-4c2b-9d8e-1a2b3c4d5e6f";

const VALID: LeadFormValues = {
  ...EMPTY_LEAD_FORM_VALUES,
  name: "Viajera Ficticia",
  phone: FAKE_NATIONAL,
  email: "viajera@example.test",
  travelMonth: "2027-03",
  adults: "2",
  children: "1",
  consentContact: true,
};

const SEARCH = new URLSearchParams({
  utm_source: "fuente-ficticia",
  utm_medium: "medio-ficticio",
  utm_campaign: "campana-ficticia",
  utm_content: "contenido-ficticio",
  utm_term: "termino-ficticio",
  fbclid: "fbclid-ficticio",
  gclid: "gclid-ficticio",
  fbp: "no-debe-leerse",
  otro: "ignorado",
});

function ctx(overrides: Partial<Parameters<typeof buildLeadBody>[1]> = {}) {
  return {
    landingSlug: "ejemplo",
    tourIds: ["tour-ejemplo"],
    legalTexts,
    phoneDefaultRegion,
    searchParams: SEARCH,
    eventId: EVENT_ID,
    ...overrides,
  };
}

describe("readAttribution", () => {
  it("lee solo UTMs, fbclid y gclid, mapeados y recortados a 500", () => {
    expect(readAttribution(SEARCH)).toEqual({
      utmSource: "fuente-ficticia",
      utmMedium: "medio-ficticio",
      utmCampaign: "campana-ficticia",
      utmContent: "contenido-ficticio",
      utmTerm: "termino-ficticio",
      fbclid: "fbclid-ficticio",
      gclid: "gclid-ficticio",
    });
    const long = readAttribution(new URLSearchParams({ utm_source: "x".repeat(600), gclid: "" }));
    expect(long).toEqual({ utmSource: "x".repeat(500) });
  });
});

describe("buildLeadBody (#1)", () => {
  it("cumple LandingLeadInput con textVersion del pack y la atribución de la URL", () => {
    const body = buildLeadBody(VALID, ctx());
    const parsed = LandingLeadInput.parse(body);
    expect(parsed.consent).toEqual({ contact: true, marketing: false, textVersion: legalTexts.version });
    expect(parsed.attribution).toEqual({ ...readAttribution(SEARCH), eventId: EVENT_ID });
    expect(parsed).toMatchObject({
      name: "Viajera Ficticia",
      phone: FAKE_E164,
      email: "viajera@example.test",
      travelMonth: "2027-03",
      pax: { adults: 2, children: 1 },
      landingSlug: "ejemplo",
      tourIds: ["tour-ejemplo"],
      website: "",
    });
  });

  it("omite email, mes y personas si no se rellenan; tourIds vacío por defecto", () => {
    const body = buildLeadBody(
      { ...VALID, email: "", travelMonth: "", adults: "", children: "", consentMarketing: true },
      ctx({ tourIds: undefined, searchParams: new URLSearchParams() }),
    );
    expect(LandingLeadInput.parse(body)).toEqual({
      name: "Viajera Ficticia",
      phone: FAKE_E164,
      tourIds: [],
      landingSlug: "ejemplo",
      attribution: { eventId: EVENT_ID },
      consent: { contact: true, marketing: true, textVersion: legalTexts.version },
      website: "",
    });
  });
});

describe("validateLeadForm", () => {
  const validate = (values: LeadFormValues) => validateLeadForm(values, { phoneDefaultRegion, texts }).fields;

  it("acepta un formulario válido con el teléfono sin prefijo (#4)", () => {
    expect(validate(VALID)).toEqual({});
  });

  it("marca cada campo con el texto del pack", () => {
    expect(
      validate({
        ...EMPTY_LEAD_FORM_VALUES,
        name: " A ",
        phone: "123",
        email: "no-es-email",
        travelMonth: "marzo",
        children: "1",
      }),
    ).toEqual({
      name: texts.errorRequired,
      phone: texts.errorPhone,
      email: texts.errorEmail,
      travelMonth: texts.errorInvalid,
      adults: texts.errorInvalid,
      consentContact: texts.errorConsent,
    });
    expect(validate({ ...VALID, phone: "" }).phone).toBe(texts.errorRequired);
    expect(validate({ ...VALID, adults: "0", children: "11" })).toEqual({
      adults: texts.errorInvalid,
      children: texts.errorInvalid,
    });
  });

  it("marca errorInvalid en niños sin adultos (adults vacío y children no vacío)", () => {
    expect(validate({ ...VALID, adults: "", children: "1" })).toEqual({
      adults: texts.errorInvalid,
    });
  });
});

describe("submitLead", () => {
  const body = buildLeadBody(VALID, ctx());
  const response = (status: number, json: unknown = {}) =>
    ({ status, ok: status >= 200 && status < 300, json: async () => json }) as Response;
  const send = (fetchImpl: typeof fetch, getAppCheckToken = async () => "token-ficticio") =>
    submitLead(body, { endpoint: "http://localhost/ficticio", getAppCheckToken, texts, fetch: fetchImpl });

  it("envía POST JSON con X-Firebase-AppCheck y trata cualquier 2xx como éxito (#3)", async () => {
    for (const status of [200, 201, 204]) {
      const fetchImpl = vi.fn(async () => response(status));
      expect(await send(fetchImpl)).toEqual({ ok: true });
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("http://localhost/ficticio");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["X-Firebase-AppCheck"]).toBe("token-ficticio");
      expect(JSON.parse(init.body as string)).toEqual(body);
    }
  });

  it.each([401, 429, 500, 405])("con %i devuelve error genérico", async (status) => {
    expect(await send(vi.fn(async () => response(status)))).toEqual({ ok: false, generic: true });
  });

  it("con red caída o fallo de App Check devuelve error genérico sin llamar a fetch", async () => {
    expect(await send(vi.fn(async () => Promise.reject(new TypeError("red ficticia caída"))))).toEqual({
      ok: false,
      generic: true,
    });
    const fetchImpl = vi.fn(async () => response(200));
    expect(await send(fetchImpl, async () => Promise.reject(new Error("sin token")))).toEqual({
      ok: false,
      generic: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("con 400 mapea fields a los campos del formulario; las rutas sin campo son genéricas", async () => {
    const fields = ["name", "phone", "email", "pax.children", "consent.contact"];
    expect(await send(vi.fn(async () => response(400, { error: "validation", fields })))).toEqual({
      ok: false,
      fields: {
        name: texts.errorRequired,
        phone: texts.errorPhone,
        email: texts.errorEmail,
        children: texts.errorInvalid,
        consentContact: texts.errorConsent,
      },
    });
    expect(
      await send(vi.fn(async () => response(400, { error: "validation", fields: ["consent.textVersion"] }))),
    ).toEqual({ ok: false, generic: true });
    expect(
      await send(vi.fn(async () => response(400, { error: "validation", fields: ["phone", "landingSlug"] }))),
    ).toEqual({ ok: false, fields: { phone: texts.errorPhone }, generic: true });
  });

  it("con 400 mapea pax.children y travelMonth a errorInvalid", async () => {
    expect(
      await send(vi.fn(async () => response(400, { error: "validation", fields: ["pax.children", "travelMonth"] }))),
    ).toEqual({
      ok: false,
      fields: { children: texts.errorInvalid, travelMonth: texts.errorInvalid },
    });
  });
});
