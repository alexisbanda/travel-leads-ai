import { describe, expect, it } from "vitest";
import {
  buildLeadCreatedEmail,
  buildSlaEmail,
  escapeHtml,
  notifyLocale,
  parseRecipients,
  type LeadCreatedEmailInput,
} from "./notify-email.js";

// Locales de prueba: en runtime salen de la configuración resuelta.
const ES_LOCALE = "es-XX"; // hardcoding-ok: valor de prueba
const EN_LOCALE = "en-XX"; // hardcoding-ok: valor de prueba

// Lead ficticio: nunca datos reales (AGENTS.md).
const LEAD: LeadCreatedEmailInput = {
  leadId: "01J0000000000000000000000A",
  source: "landing",
  contact: { name: "Persona Ficticia" },
  interest: {
    tourIds: ["tour-ficticio-1", "tour-ficticio-2"],
    travelMonth: "2027-03",
    pax: { adults: 2, children: 1 },
  },
};

describe("buildLeadCreatedEmail", () => {
  it("incluye nombre, mes, personas, productos, origen y leadId; el asunto lleva el producto", () => {
    const email = buildLeadCreatedEmail(LEAD, ES_LOCALE);
    expect(email.subject).toBe("Nuevo lead · tour-ficticio-1, tour-ficticio-2 · landing");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Persona Ficticia");
      expect(body).toContain("marzo de 2027");
      expect(body).toContain("2 adultos, 1 niño");
      expect(body).toContain("tour-ficticio-1, tour-ficticio-2");
      expect(body).toContain("landing");
      expect(body).toContain(LEAD.leadId);
    }
    expect(email.text).toContain("Nombre: Persona Ficticia");
    expect(email.text).toContain("Mes de viaje: marzo de 2027");
    expect(email.text).toContain("Personas: 2 adultos, 1 niño");
    expect(email.text).toContain("Productos: tour-ficticio-1, tour-ficticio-2");
    expect(email.text).toContain("Origen: landing");
    expect(email.text).toContain(`leadId: ${LEAD.leadId}`);
  });

  it("en inglés usa el catálogo en", () => {
    const email = buildLeadCreatedEmail(LEAD, EN_LOCALE);
    expect(email.subject).toBe("New lead · tour-ficticio-1, tour-ficticio-2 · landing");
    expect(email.text).toContain("Travel month: March 2027");
    expect(email.text).toContain("Travellers: 2 adults, 1 child");
    expect(email.text).toContain("Source: landing");
  });

  it("un idioma sin catálogo cae en inglés", () => {
    expect(buildLeadCreatedEmail(LEAD, "xx-XX").subject).toMatch(/^New lead · /);
  });

  it("sin mes, personas ni productos lo indica", () => {
    const email = buildLeadCreatedEmail({ ...LEAD, interest: { tourIds: [] } }, ES_LOCALE);
    expect(email.subject).toBe("Nuevo lead · sin producto · landing");
    expect(email.text).toContain("Mes de viaje: sin indicar");
    expect(email.text).toContain("Personas: sin indicar");
  });

  it("muestra el id del deal del CRM si existe, sin URL", () => {
    const without = buildLeadCreatedEmail(LEAD, ES_LOCALE);
    expect(without.text).not.toContain("CRM");
    const email = buildLeadCreatedEmail({ ...LEAD, crm: { dealId: "deal-ficticio" } }, ES_LOCALE);
    expect(email.text).toContain("Deal en el CRM: deal-ficticio");
    expect(email.html).not.toMatch(/href=/);
  });

  it("escapa en el HTML los valores del lead", () => {
    const email = buildLeadCreatedEmail(
      { ...LEAD, contact: { name: '<script>alert("x")</script> & Cía' } },
      ES_LOCALE,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cía");
  });
});

describe("notifyLocale", () => {
  it("usa agency.locale si está", () => {
    const locale = notifyLocale({ agency: { locale: EN_LOCALE }, market: { locale: ES_LOCALE } });
    expect(locale).toBe(EN_LOCALE);
    expect(buildLeadCreatedEmail(LEAD, locale).subject).toMatch(/^New lead/);
  });

  it("sin agency.locale usa el locale del mercado", () => {
    const locale = notifyLocale({ agency: {}, market: { locale: ES_LOCALE } });
    expect(locale).toBe(ES_LOCALE);
    expect(buildLeadCreatedEmail(LEAD, locale).subject).toMatch(/^Nuevo lead/);
  });
});

describe("parseRecipients", () => {
  it("separa por comas y saltos de línea, recorta y descarta vacíos", () => {
    expect(parseRecipients(" a@example.test, b@example.test\n\nc@example.test ,")).toEqual([
      "a@example.test",
      "b@example.test",
      "c@example.test",
    ]);
  });

  it("un valor vacío no da destinatarios", () => {
    expect(parseRecipients(" \n , ")).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapa los cinco caracteres especiales", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("buildSlaEmail", () => {
  const SLA_LEAD = { leadId: LEAD.leadId, source: LEAD.source, contact: LEAD.contact };

  it("warning en español: asunto con minutos y origen, umbral en el cuerpo", () => {
    const email = buildSlaEmail("warning", SLA_LEAD, 12, 10, ES_LOCALE);
    expect(email.subject).toBe("SLA en riesgo · 12 min sin respuesta · landing");
    expect(email.text).toBe(
      [
        "Un lead nuevo lleva 12 minutos hábiles sin primera respuesta (umbral: 10).",
        "",
        "Nombre: Persona Ficticia",
        "Origen: landing",
        `leadId: ${LEAD.leadId}`,
      ].join("\n"),
    );
  });

  it("breach en inglés", () => {
    const email = buildSlaEmail("breach", SLA_LEAD, 31, 30, EN_LOCALE);
    expect(email.subject).toBe("SLA breached · 31 min without reply · landing");
    expect(email.text).toContain(
      "A new lead has gone 31 business minutes without a first reply (threshold: 30).",
    );
  });

  it("idioma desconocido: inglés", () => {
    expect(buildSlaEmail("warning", SLA_LEAD, 10, 10, "xx-XX").subject).toMatch(/^SLA at risk/);
  });

  it("escapa el nombre en el HTML", () => {
    const email = buildSlaEmail(
      "breach",
      { ...SLA_LEAD, contact: { name: "<b>Ficticia</b>" } },
      31,
      30,
      ES_LOCALE,
    );
    expect(email.html).toContain("&lt;b&gt;Ficticia&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Ficticia");
  });
});
