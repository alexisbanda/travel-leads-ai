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
    media: {
      src: "/media/ejemplo-hero.mp4",
      kind: "video",
      poster: "/media/ejemplo-hero.jpg",
      alt: "Texto alternativo de ejemplo",
    },
  },
  sections: ["itinerary", "includes", "bestSeason", "priceGuidance", "faq", "trust", "cta"],
  itinerary: [
    { day: 1, title: "Día de ejemplo 1", description: "Descripción de ejemplo." },
    { day: 2, title: "Día de ejemplo 2", description: "Descripción de ejemplo." },
  ],
  includes: { included: ["Elemento incluido"], notIncluded: ["Elemento no incluido"] },
  bestSeason: { summary: "Resumen de ejemplo de la mejor época." },
  priceGuidance: { from: 1000 },
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

  it("pone aiGenerated a false por defecto en el medio del hero", () => {
    const result = LandingContent.safeParse(validContent);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hero.media?.aiGenerated).toBe(false);
  });

  it("acepta aiGenerated explícito y kind image sin poster", () => {
    const media = { src: "/media/ejemplo.jpg", kind: "image", alt: "Alt", aiGenerated: true };
    const result = LandingContent.safeParse(withValue(validContent, "hero.media", media));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hero.media?.aiGenerated).toBe(true);
  });

  it("rechaza hero.media como cadena (formato antiguo) en la ruta hero.media", () => {
    const result = LandingContent.safeParse(
      withValue(validContent, "hero.media", "/media/ejemplo-hero.mp4"),
    );
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("hero.media");
  });

  it.each([
    ["hero.media.alt", ""],
    ["hero.media.kind", "audio"],
    ["priceGuidance.from", 0],
    ["priceGuidance.from", -10],
    ["includes.included", []],
    ["bestSeason.summary", " "],
    ["itinerary", []],
  ])("rechaza %s = %j en su ruta", (path, value) => {
    const result = LandingContent.safeParse(withValue(validContent, path, value));
    expect(result.success).toBe(false);
    expect(issuePaths(result).some((p) => p.startsWith(path))).toBe(true);
  });

  it("rechaza un día 0 en el itinerario", () => {
    const itinerary = [{ day: 0, title: "Día", description: "Descripción" }];
    const result = LandingContent.safeParse({ ...validContent, itinerary });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("itinerary.0.day");
  });

  it("acepta sin datos de secciones (todas opcionales)", () => {
    const {
      itinerary: _i,
      includes: _inc,
      bestSeason: _b,
      priceGuidance: _p,
      ...rest
    } = validContent;
    expect(LandingContent.safeParse(rest).success).toBe(true);
  });

  it("es estricto: rechaza campos desconocidos", () => {
    const result = LandingContent.safeParse({ ...validContent, unknown: "x" });
    expect(result.success).toBe(false);
  });
});

describe("LandingContent.highlights", () => {
  it("acepta de 1 a 4 highlights y es opcional", () => {
    expect(LandingContent.safeParse({ ...validContent, highlights: ["Chip de ejemplo"] }).success).toBe(true);
    expect(
      LandingContent.safeParse({ ...validContent, highlights: ["Uno", "Dos", "Tres", "Cuatro"] }).success,
    ).toBe(true);
    expect(LandingContent.safeParse(validContent).success).toBe(true);
  });

  it.each([
    ["vacío", []],
    ["más de 4", ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]],
    ["con un texto vacío", ["Uno", " "]],
    ["con un texto de más de 40 caracteres", ["x".repeat(41)]],
  ])("rechaza highlights %s", (_name, highlights) => {
    const result = LandingContent.safeParse({ ...validContent, highlights });
    expect(result.success).toBe(false);
    expect(issuePaths(result).every((path) => path.startsWith("highlights"))).toBe(true);
  });

  it("acepta un highlight de exactamente 40 caracteres", () => {
    expect(LandingContent.safeParse({ ...validContent, highlights: ["x".repeat(40)] }).success).toBe(true);
  });
});

describe("LandingContent.gallery", () => {
  const image = (n: number) => ({ src: `/media/galeria-${n}.jpg`, kind: "image", alt: `Imagen de ejemplo ${n}` });

  it("acepta de 3 a 12 imágenes y pone aiGenerated a false por defecto", () => {
    const result = LandingContent.safeParse({ ...validContent, gallery: [image(1), image(2), image(3)] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gallery?.every((item) => item.aiGenerated === false)).toBe(true);
    const twelve = Array.from({ length: 12 }, (_, i) => image(i));
    expect(LandingContent.safeParse({ ...validContent, gallery: twelve }).success).toBe(true);
  });

  it("rechaza menos de 3 o más de 12 imágenes", () => {
    expect(issuePaths(LandingContent.safeParse({ ...validContent, gallery: [image(1), image(2)] }))).toEqual([
      "gallery",
    ]);
    const thirteen = Array.from({ length: 13 }, (_, i) => image(i));
    expect(issuePaths(LandingContent.safeParse({ ...validContent, gallery: thirteen }))).toEqual(["gallery"]);
  });

  it("rechaza un vídeo en la galería con un mensaje claro en gallery.N.kind", () => {
    const gallery = [image(1), { ...image(2), kind: "video" }, image(3)];
    const result = LandingContent.safeParse({ ...validContent, gallery });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(["gallery.1.kind"]);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('kind: "image"');
  });

  it("rechaza una imagen sin alt", () => {
    const { alt: _alt, ...noAlt } = image(2);
    const result = LandingContent.safeParse({ ...validContent, gallery: [image(1), noAlt, image(3)] });
    expect(issuePaths(result)).toEqual(["gallery.1.alt"]);
  });

  it("admite la sección gallery en sections", () => {
    const result = LandingContent.safeParse({ ...validContent, sections: ["gallery", "cta"] });
    expect(result.success).toBe(true);
  });
});
