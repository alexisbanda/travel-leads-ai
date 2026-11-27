import {
  LandingBestSeason,
  LandingContent,
  LandingHero,
  LandingIncludes,
  LandingSection,
  LandingSeo,
  NonEmptyText,
} from "@tla/shared";
import { z } from "zod";
import type { LandingBrief } from "./brief.js";

/**
 * Secciones que puede proponer el modelo. `gallery` (medios) y
 * `priceGuidance` (precio del brief) las decide `assembleLanding`.
 */
export const DRAFT_SECTIONS = LandingSection.options.filter(
  (section) => section !== "gallery" && section !== "priceGuidance",
);

const draftShape = {
  seo: LandingSeo,
  hero: LandingHero.omit({ media: true }),
  highlights: LandingContent.shape.highlights,
  sections: LandingContent.shape.sections,
  itinerary: LandingContent.shape.itinerary,
  includes: LandingIncludes.optional(),
  bestSeason: LandingBestSeason.optional(),
  faq: LandingContent.shape.faq,
};

const DraftCta = z.object({ prefill: NonEmptyText }).strict();

/**
 * Lo ÚNICO que rellena el modelo: textos de la landing. No incluye `slug`,
 * `draft`, `tourIds`, `segment`, `cta.type`, `priceGuidance`, `gallery`,
 * `hero.media` ni `experiment`, que impone `assembleLanding` desde el brief.
 * `cta.prefill` (mensaje predefinido de WhatsApp) solo existe con
 * `ctaType: whatsapp`.
 */
export function landingDraftSchema(ctaType: LandingBrief["ctaType"]) {
  return ctaType === "whatsapp"
    ? z.object({ ...draftShape, cta: DraftCta }).strict()
    : z.object(draftShape).strict();
}

/** Borrador validado (la forma común a los dos tipos de CTA). */
export interface LandingDraft {
  seo: LandingSeo;
  hero: { headline: string; subheadline?: string };
  highlights?: string[];
  sections: LandingSection[];
  itinerary?: { day: number; title: string; description: string }[];
  includes?: LandingIncludes;
  bestSeason?: LandingBestSeason;
  faq?: { q: string; a: string }[];
  cta?: { prefill?: string };
}

const text = (description?: string) =>
  description === undefined ? { type: "string" } : { type: "string", description };
const array = (items: unknown, description?: string) =>
  description === undefined ? { type: "array", items } : { type: "array", items, description };
const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/**
 * JSON Schema del borrador para la salida estructurada de la API. Solo usa
 * palabras clave admitidas (sin longitudes ni límites de elementos): Zod
 * (`landingDraftSchema`) recupera esas restricciones al validar la respuesta.
 * Pide todos los bloques de contenido para que el borrador salga completo.
 */
export function landingDraftJsonSchema(ctaType: LandingBrief["ctaType"]): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    seo: object({ title: text("SEO title"), description: text("SEO meta description") }, [
      "title",
      "description",
    ]),
    hero: object({ headline: text(), subheadline: text() }, ["headline", "subheadline"]),
    highlights: array(text("At most 40 characters"), "1 to 4 short chips"),
    sections: array({ type: "string", enum: DRAFT_SECTIONS }, "Sections to render"),
    itinerary: array(
      object({ day: { type: "integer" }, title: text(), description: text() }, [
        "day",
        "title",
        "description",
      ]),
      "Exactly one entry per day, numbered from 1",
    ),
    includes: object({ included: array(text()), notIncluded: array(text()) }, [
      "included",
      "notIncluded",
    ]),
    bestSeason: object({ summary: text() }, ["summary"]),
    faq: array(object({ q: text(), a: text() }, ["q", "a"])),
  };
  const required = [
    "seo",
    "hero",
    "highlights",
    "sections",
    "itinerary",
    "includes",
    "bestSeason",
    "faq",
  ];
  if (ctaType === "whatsapp") {
    properties.cta = object({ prefill: text("Prefilled WhatsApp message") }, ["prefill"]);
    required.push("cta");
  }
  return object(properties, required);
}

/** Campos que impone el brief: se descartan si el modelo los devuelve. */
const IMPOSED_TOP_LEVEL = [
  "slug",
  "segment",
  "tourIds",
  "priceGuidance",
  "gallery",
  "experiment",
  "draft",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParseDraftResult = { ok: true; draft: LandingDraft } | { ok: false; errors: string[] };

/**
 * Valida la salida del modelo contra `landingDraftSchema`. Antes descarta los
 * campos que impone el brief (`slug`, `draft`, `tourIds`, `segment`,
 * `priceGuidance`, `gallery`, `experiment`, `hero.media`, `cta.type`), para
 * que nunca prevalezcan, y comprueba que el itinerario tenga exactamente
 * `days` días numerados desde 1.
 */
export function parseDraft(raw: unknown, brief: LandingBrief): ParseDraftResult {
  if (!isRecord(raw))
    return { ok: false, errors: ["(raíz): la respuesta debe ser un objeto JSON"] };
  const candidate: Record<string, unknown> = { ...raw };
  for (const key of IMPOSED_TOP_LEVEL) delete candidate[key];
  if (isRecord(candidate.hero)) {
    const { media: _media, ...hero } = candidate.hero;
    candidate.hero = hero;
  }
  if (isRecord(candidate.cta)) {
    const { type: _type, ...cta } = candidate.cta;
    candidate.cta = cta;
  }
  if (brief.ctaType !== "whatsapp") delete candidate.cta;

  const result = landingDraftSchema(brief.ctaType).safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join(".") : "(raíz)";
        return `${field}: ${issue.message}`;
      }),
    };
  }
  const draft: LandingDraft = result.data;
  const days = draft.itinerary ?? [];
  const numbered = days.every((entry, index) => entry.day === index + 1);
  if (days.length !== brief.days || !numbered) {
    return {
      ok: false,
      errors: [
        `itinerary: debe tener exactamente ${brief.days} ${brief.days === 1 ? "día" : "días"}, numerados del 1 al ${brief.days}`,
      ],
    };
  }
  return { ok: true, draft };
}

/** `prefill` sin el código de campaña repetido y terminado en `[código]`. */
export function withCampaignCode(prefill: string | undefined, campaignCode: string): string {
  const tag = `[${campaignCode}]`;
  const base = (prefill ?? "").split(tag).join(" ").replace(/\s+/g, " ").trim();
  return base === "" ? tag : `${base} ${tag}`;
}

/**
 * Compone la landing a partir del borrador del modelo y el brief. Impone
 * `slug`, `draft: true`, `tourIds`, `segment` y `cta.type`; añade
 * `priceGuidance` solo si el brief trae `priceFrom` (y la sección
 * correspondiente); quita `gallery` de las secciones (sin medios) y, si hay
 * `campaignCode`, hace que `cta.prefill` termine en `[código]`. El resultado
 * se valida después con `LandingContent` (`validateLandingFiles`).
 */
export function assembleLanding(
  draft: LandingDraft,
  brief: LandingBrief,
  slug: string,
): LandingContent {
  const wanted = new Set<LandingSection>(draft.sections);
  wanted.delete("gallery");
  wanted.delete("priceGuidance");
  if (brief.priceFrom !== undefined) wanted.add("priceGuidance");
  const sections = LandingSection.options.filter((section) => wanted.has(section));

  let prefill = brief.ctaType === "whatsapp" ? draft.cta?.prefill : undefined;
  if (brief.campaignCode !== undefined) prefill = withCampaignCode(prefill, brief.campaignCode);

  return {
    slug,
    segment: brief.segment,
    tourIds: [...brief.tourIds],
    seo: draft.seo,
    hero: draft.hero,
    ...(draft.highlights !== undefined && { highlights: draft.highlights }),
    sections,
    ...(draft.itinerary !== undefined && { itinerary: draft.itinerary }),
    ...(draft.includes !== undefined && { includes: draft.includes }),
    ...(draft.bestSeason !== undefined && { bestSeason: draft.bestSeason }),
    ...(brief.priceFrom !== undefined && { priceGuidance: { from: brief.priceFrom } }),
    ...(draft.faq !== undefined && { faq: draft.faq }),
    cta: { type: brief.ctaType, ...(prefill !== undefined && { prefill }) },
    draft: true,
  };
}
