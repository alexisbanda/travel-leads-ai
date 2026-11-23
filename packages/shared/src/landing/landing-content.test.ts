import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { LandingContent } from "./landing-content.js";

/** Paths (con puntos) de todos los issues de un `safeParse`. */
function issuePaths(result: z.SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
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

// Contenido ficticio: nada de datos reales de viajeros.
const validContent = {
  slug: "destino-ejemplo",
  segment: "adventure",
  tourIds: ["tour-ejemplo-8d"],
  seo: {
    title: "Título de ejemplo para la landing",
    description: "Descripción de ejemplo para SEO.",
  },
  hero: {
    headline: "Titular de ejemplo",
    subheadline: "Subtitular de ejemplo",
    media: "/media/ejemplo-hero.mp4",
  },
  sections: ["itinerary", "includes", "bestSeason", "priceGuidance", "faq", "trust", "cta"],
  faq: [{ q: "¿Pregunta de ejemplo?", a: "Respuesta de ejemplo." }],
  cta: { type: "whatsapp", prefill: "Hola, me interesa [EJ-01]" },
  experiment: { id: "hero-v2", variant: "B" },
};

describe("LandingContent", () => {
  it("acepta un contenido completo y pone draft a false por defecto", () => {
    const result = LandingContent.safeParse(validContent);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.draft).toBe(false);
  });

  it("acepta draft explícito", () => {
    const result = LandingContent.safeParse({ ...validContent, draft: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.draft).toBe(true);
  });

  it("acepta sin faq ni experiment (opcionales)", () => {
    const { faq: _faq, experiment: _experiment, ...rest } = validContent;
    expect(LandingContent.safeParse(rest).success).toBe(true);
  });

  it.each([
    ["slug", "Destino_Ejemplo"],
    ["slug", "destino ejemplo"],
    ["segment", ""],
    ["tourIds", []],
    ["seo.title", ""],
    ["seo.description", "   "],
    ["hero.headline", ""],
    ["sections", []],
    ["sections", ["unknown"]],
    ["cta.type", "email"],
    ["faq", [{ q: "", a: "respuesta" }]],
  ])("rechaza un %s inválido", (path, value) => {
    const result = LandingContent.safeParse(withValue(validContent, path, value));
    expect(result.success).toBe(false);
    expect(issuePaths(result).length).toBeGreaterThan(0);
  });

  it("falla con seo.title ausente y lo reporta en la ruta del campo", () => {
    const { title: _title, ...seoWithoutTitle } = validContent.seo;
    const result = LandingContent.safeParse({ ...validContent, seo: seoWithoutTitle });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("seo.title");
  });

  it("es estricto: rechaza campos desconocidos", () => {
    const result = LandingContent.safeParse({ ...validContent, unknown: "x" });
    expect(result.success).toBe(false);
  });
});
