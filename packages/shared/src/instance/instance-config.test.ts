import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { parse } from "yaml";
import { LeadSegment, TravelMonth } from "../lead.js";
import { InstanceConfig, LeadFormField, LeadFormFieldValue } from "./instance-config.js";

// Utilidades de test (duplicadas en cada archivo de test para no publicarlas en el build).
/** Primer valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
function firstSupported(kind: "currency" | "timeZone"): string {
  const value = Intl.supportedValuesOf(kind)[0];
  if (value === undefined) throw new Error(`Intl no expone valores de ${kind}`);
  return value;
}

/** Copia profunda de `base` con `value` en la ruta con puntos `path`. */
function withValue<T>(base: T, path: string, value: unknown): T {
  const copy = structuredClone(base);
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) throw new Error("ruta vacía");
  let node = copy as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
  return copy;
}

/** Issues de un `safeParse` fallido cuyo path coincide con `path` (con puntos). */
function issuesAt(result: z.SafeParseReturnType<unknown, unknown>, path: string) {
  if (result.success) return [];
  return result.error.issues.filter((issue) => issue.path.join(".") === path);
}

/** Paths (con puntos) de todos los issues de un `safeParse`. */
function issuePaths(result: z.SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

function loadInstanceYaml(id: string): unknown {
  const file = fileURLToPath(new URL(`../../../../instances/${id}/instance.yaml`, import.meta.url));
  return parse(readFileSync(file, "utf8"));
}

const template = loadInstanceYaml("_template");
const ecEs = loadInstanceYaml("ec-es");

// Número ficticio (código de país no asignado), construido para no parecer un literal real.
const FAKE_E164 = ["+", "999", "0000000"].join("");

const REQUIRED_OUTSIDE_DRAFT = [
  "agency.legalName",
  "partner.legalName",
  "channels.whatsapp.number",
  "commission.rate",
];

const SECRET_FIELDS = [
  "agency.notify.target",
  "channels.crm.tokenSecret",
  "channels.whatsapp.webhookSecret",
  "channels.meta.capiTokenSecret",
  "channels.meta.pageTokenSecret",
];

describe("InstanceConfig con los YAML del repositorio", () => {
  it.each([
    ["_template", template],
    ["ec-es", ecEs],
  ])("parsea instances/%s/instance.yaml en draft", (_id, raw) => {
    const result = InstanceConfig.safeParse(raw);
    expect(issuePaths(result)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("draft");
  });
});

describe("InstanceConfig: estándares de país, moneda, idioma y zona horaria", () => {
  it.each([
    ["market.country", "ESP", /ISO 3166-1 alfa-2/],
    ["market.currency", "EURO", /ISO 4217/],
    ["market.locale", "es_ES!", /BCP 47/],
    ["market.timezone", "Mars/Olympus", /IANA/],
  ])("rechaza %s = %s con un error que nombra el campo y el estándar", (path, value, standard) => {
    const result = InstanceConfig.safeParse(withValue(ecEs, path, value));
    expect(result.success).toBe(false);
    const issues = issuesAt(result, path);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(standard);
  });

  it("acepta moneda, idioma y zona horaria válidos cuando se indican", () => {
    let raw = withValue(ecEs, "market.currency", firstSupported("currency"));
    raw = withValue(raw, "market.timezone", firstSupported("timeZone"));
    raw = withValue(raw, "market.locale", "xx-XX");
    raw = withValue(raw, "agency.timezone", firstSupported("timeZone"));
    expect(issuePaths(InstanceConfig.safeParse(raw))).toEqual([]);
  });

  it("rechaza un id que no sigue <destino>-<mercado>[-<sufijo>]", () => {
    const result = InstanceConfig.safeParse(withValue(ecEs, "id", "XX_YY"));
    expect(issuePaths(result)).toEqual(["id"]);
  });
});

describe("InstanceConfig: secretos", () => {
  it.each(SECRET_FIELDS)("rechaza un secreto en claro en %s", (path) => {
    const result = InstanceConfig.safeParse(withValue(ecEs, path, "abc123"));
    expect(result.success).toBe(false);
    const issues = issuesAt(result, path);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/secret:NOMBRE/);
  });

  it("acepta una referencia secret:NOMBRE", () => {
    const raw = withValue(ecEs, "channels.crm.tokenSecret", "secret:HUBSPOT_TOKEN");
    expect(InstanceConfig.safeParse(raw).success).toBe(true);
  });
});

describe("InstanceConfig: canales de CRM y aviso", () => {
  it("acepta el proveedor de CRM memory (solo desarrollo)", () => {
    const raw = withValue(ecEs, "channels.crm.provider", "memory");
    expect(issuePaths(InstanceConfig.safeParse(raw))).toEqual([]);
  });

  it("rechaza un proveedor de CRM desconocido", () => {
    const raw = withValue(ecEs, "channels.crm.provider", "otro-crm");
    expect(issuePaths(InstanceConfig.safeParse(raw))).toEqual(["channels.crm.provider"]);
  });

  it("admite omitir agency.notify", () => {
    const raw = structuredClone(ecEs) as { agency: Record<string, unknown> };
    delete raw.agency.notify;
    const result = InstanceConfig.safeParse(raw);
    expect(issuePaths(result)).toEqual([]);
    expect(result.data?.agency.notify).toBeUndefined();
  });

  it("si agency.notify está, exige canal y destino", () => {
    const raw = withValue(ecEs, "agency.notify", { channel: "email" });
    expect(issuePaths(InstanceConfig.safeParse(raw))).toEqual(["agency.notify.target"]);
  });
});

describe("InstanceConfig: campos obligatorios según status", () => {
  it("en draft admite vacíos los datos legales, el número de WhatsApp y la comisión", () => {
    expect(InstanceConfig.safeParse(withValue(ecEs, "status", "draft")).success).toBe(true);
  });

  it.each(["pilot", "active", "paused"])(
    "en %s exige datos legales, número de WhatsApp y comisión (un issue por campo)",
    (status) => {
      const result = InstanceConfig.safeParse(withValue(ecEs, "status", status));
      expect(result.success).toBe(false);
      expect(issuePaths(result).sort()).toEqual([...REQUIRED_OUTSIDE_DRAFT].sort());
    },
  );

  it("en pilot pasa con los cuatro campos rellenos", () => {
    let raw = withValue(ecEs, "status", "pilot");
    raw = withValue(raw, "agency.legalName", "Agencia Ficticia S.A.");
    raw = withValue(raw, "partner.legalName", "Socio Ficticio");
    raw = withValue(raw, "channels.whatsapp.number", FAKE_E164);
    raw = withValue(raw, "commission.rate", 0.1);
    expect(issuePaths(InstanceConfig.safeParse(raw))).toEqual([]);
  });

  it("rechaza un número de WhatsApp que no está en E.164", () => {
    const result = InstanceConfig.safeParse(
      withValue(ecEs, "channels.whatsapp.number", "600 000 000"),
    );
    expect(issuePaths(result)).toEqual(["channels.whatsapp.number"]);
  });
});

describe("InstanceConfig: mapa de preguntas del formulario de Meta", () => {
  const FIELD_MAP = "channels.meta.leadForm.fieldMap";

  it("ec-es mapea «¿Cuándo quieres viajar?» a travelMonth", () => {
    const result = InstanceConfig.safeParse(ecEs);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const mapping = result.data.channels.meta.leadForm?.fieldMap.cuando_quieres_viajar;
    expect(mapping).toMatchObject({ field: "travelMonth" });
  });

  it("leadForm es opcional y fieldMap vale {} por defecto", () => {
    const sinLeadForm = withValue(ecEs, "channels.meta.leadForm", undefined);
    expect(InstanceConfig.safeParse(sinLeadForm).success).toBe(true);
    const result = InstanceConfig.safeParse(withValue(ecEs, "channels.meta.leadForm", {}));
    expect(result.success && result.data.channels.meta.leadForm?.fieldMap).toEqual({});
  });

  it("acepta la forma corta y la forma con values para cada destino", () => {
    const fieldMap = {
      comentarios: "notes",
      adultos: "paxAdults",
      ninos: { field: "paxChildren", values: { ninguno: 0, dos: 2 } },
      presupuesto: { field: "budgetRange", values: { bajo: "<1000", medio: "1000-2000" } },
      tipo_viaje: { field: "segment", values: { pareja: "couple" } },
      ofertas: { field: "marketingConsent", values: { si: true, no: false } },
    };
    expect(InstanceConfig.safeParse(withValue(ecEs, FIELD_MAP, fieldMap)).success).toBe(true);
  });

  it("rechaza un campo destino desconocido", () => {
    const result = InstanceConfig.safeParse(withValue(ecEs, FIELD_MAP, { pregunta: "telefono" }));
    expect(result.success).toBe(false);
    expect(issuePaths(result).some((path) => path.startsWith(`${FIELD_MAP}.pregunta`))).toBe(true);
  });

  it.each([
    ["travelMonth", "marzo"],
    ["paxAdults", 0],
    ["paxChildren", 1.5],
    ["budgetRange", "barato"],
    ["segment", "familia"],
    ["notes", "  "],
    ["marketingConsent", "si"],
  ])("rechaza en values un valor inválido para %s", (field, value) => {
    const raw = withValue(ecEs, FIELD_MAP, { pregunta: { field, values: { respuesta: value } } });
    const result = InstanceConfig.safeParse(raw);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(`${FIELD_MAP}.pregunta.values.respuesta`);
  });

  it("rechaza claves desconocidas en el mapeo con values", () => {
    const raw = withValue(ecEs, FIELD_MAP, {
      pregunta: { field: "notes", values: {}, extra: true },
    });
    expect(InstanceConfig.safeParse(raw).success).toBe(false);
  });

  it("los valores de travelMonth y segment coinciden con los esquemas del lead", () => {
    expect(LeadFormFieldValue.segment.options).toEqual(LeadSegment.options);
    for (const sample of ["2027-03", "2027-3", "marzo", "2027-03-01"]) {
      expect(LeadFormFieldValue.travelMonth.safeParse(sample).success).toBe(
        TravelMonth.safeParse(sample).success,
      );
    }
    expect(Object.keys(LeadFormFieldValue).sort()).toEqual([...LeadFormField.options].sort());
  });
});
