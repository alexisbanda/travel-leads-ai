import { z } from "zod";
import { NonEmptyText } from "../instance/primitives.js";

/**
 * Identificador en kebab-case estricto (minúsculas, dígitos y `-`), usado
 * para el slug de una landing: debe coincidir con el nombre del archivo
 * `instances/<id>/content/landings/<slug>.json` (lo comprueba instance-cli).
 */
export const LandingSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "identificador inválido: usa kebab-case (minúsculas, dígitos y -)",
});
export type LandingSlug = z.infer<typeof LandingSlug>;

/** Secciones disponibles en la plantilla de landing, en el orden en que se renderizan. */
export const LandingSection = z.enum([
  "itinerary",
  "includes",
  "bestSeason",
  "priceGuidance",
  "faq",
  "trust",
  "cta",
]);
export type LandingSection = z.infer<typeof LandingSection>;

/** Metadatos SEO de la landing: obligatorios y no vacíos. */
export const LandingSeo = z
  .object({
    title: NonEmptyText,
    description: NonEmptyText,
  })
  .strict();
export type LandingSeo = z.infer<typeof LandingSeo>;

/** Contenido del bloque principal (hero). */
export const LandingHero = z
  .object({
    headline: NonEmptyText,
    subheadline: NonEmptyText.optional(),
    /** Ruta o URL del vídeo/imagen del hero. */
    media: NonEmptyText.optional(),
  })
  .strict();
export type LandingHero = z.infer<typeof LandingHero>;

/** Pregunta y respuesta de la sección de FAQ. */
export const LandingFaqItem = z
  .object({
    q: NonEmptyText,
    a: NonEmptyText,
  })
  .strict();
export type LandingFaqItem = z.infer<typeof LandingFaqItem>;

/** Tipo de llamada a la acción principal de la landing. */
export const LandingCtaType = z.enum(["whatsapp", "form"]);
export type LandingCtaType = z.infer<typeof LandingCtaType>;

export const LandingCta = z
  .object({
    type: LandingCtaType,
    /** Mensaje predefinido (WhatsApp) con el código de campaña, si aplica. */
    prefill: NonEmptyText.optional(),
  })
  .strict();
export type LandingCta = z.infer<typeof LandingCta>;

/** Referencia a un experimento A/B en curso para esta landing. */
export const LandingExperiment = z
  .object({
    id: NonEmptyText,
    variant: NonEmptyText,
  })
  .strict();
export type LandingExperiment = z.infer<typeof LandingExperiment>;

/**
 * Contenido de una landing (`instances/<id>/content/landings/<slug>.json`).
 * El motor no interpreta el contenido (textos, tours): solo valida su forma.
 * `draft: true` (por defecto `false`) excluye la landing del sitio salvo que
 * la instancia completa esté en `draft` (lo decide `apps/landings`).
 */
export const LandingContent = z
  .object({
    slug: LandingSlug,
    /** Segmento de viajero al que se dirige (coherente con `segments` de la instancia). */
    segment: NonEmptyText,
    /** Tours del catálogo que ilustra la landing. */
    tourIds: z.array(NonEmptyText).min(1, { message: "indica al menos un tour" }),
    seo: LandingSeo,
    hero: LandingHero,
    sections: z
      .array(LandingSection)
      .min(1, { message: "indica al menos una sección" }),
    faq: z.array(LandingFaqItem).optional(),
    cta: LandingCta,
    experiment: LandingExperiment.optional(),
    draft: z.boolean().default(false),
  })
  .strict();
export type LandingContent = z.infer<typeof LandingContent>;
