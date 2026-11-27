import type { LandingBrief } from "./brief.js";
import { DRAFT_SECTIONS } from "./draft.js";

/**
 * Prompts del generador de landings. Motor genérico (regla 1): aquí no hay
 * países, monedas ni textos legales; idioma y tono salen del pack de mercado
 * resuelto. El prompt solo recibe hechos del producto: nunca datos de leads.
 */

export interface PromptContext {
  /** Locale del mercado (BCP 47): idioma y variante de todos los textos. */
  locale: string;
  /** Tono del pack de mercado (`agentTone`). */
  agentTone: string;
  /** Textos de una landing existente como ejemplo de estilo (`--from`), ya sin medios ni precio. */
  example?: unknown;
}

/** Campos de texto de una landing existente que sirven de ejemplo de estilo. */
const EXAMPLE_KEYS = ["seo", "hero", "highlights", "itinerary", "includes", "bestSeason", "faq"];

/**
 * Reduce una landing existente a sus textos: sin `hero.media`, `gallery`,
 * `priceGuidance`, `cta`, `experiment` ni identificadores.
 */
export function styleExample(landing: unknown): Record<string, unknown> | undefined {
  if (typeof landing !== "object" || landing === null || Array.isArray(landing)) return undefined;
  const source = landing as Record<string, unknown>;
  const example: Record<string, unknown> = {};
  for (const key of EXAMPLE_KEYS) {
    if (source[key] !== undefined) example[key] = source[key];
  }
  const hero = example.hero;
  if (typeof hero === "object" && hero !== null && !Array.isArray(hero)) {
    const { media: _media, ...rest } = hero as Record<string, unknown>;
    example.hero = rest;
  }
  return example;
}

export function buildSystemPrompt(brief: LandingBrief, context: PromptContext): string {
  const lines = [
    "You write the copy of a travel landing page for an inbound travel agency.",
    "Your output is a JSON object that follows the provided schema. It is a draft that a person reviews before publishing.",
    "",
    "Language and tone:",
    `- Write ALL text in the language and regional variant of the locale "${context.locale}".`,
    `- Follow this tone guide (it may be written in that language): ${context.agentTone}`,
    "",
    "Facts:",
    "- Use only the facts in the brief. Do not invent places, services, durations, inclusions, schedules, ratings or awards.",
    "- If the brief does not cover something, leave it out or describe it in general terms that stay true.",
    "",
    "Prices, availability and bookings (strict):",
    "- Never write prices, amounts of money, currencies, discounts or payment terms in any text. A guide price, if any, is shown separately by the page template.",
    "- Never promise or confirm availability, guaranteed departures, seats, bookings or a final price. The agency only gives orientative information and a person confirms everything later.",
    "- Do not urge the reader to book or buy now. Invite them to ask for information or a tailored proposal instead.",
    "",
    "Structure:",
    `- itinerary: exactly ${brief.days} ${brief.days === 1 ? "entry" : "entries"}, one per day, with "day" numbered from 1 to ${brief.days} in order.`,
    "- highlights: 1 to 4 short chips, each at most 40 characters.",
    `- sections: choose from ${DRAFT_SECTIONS.join(", ")}, in that order. Include every section you write content for, plus "trust" and "cta".`,
    "- seo.title and seo.description: concise and descriptive, matching the page content.",
    "- includes: what the trip includes according to the brief; notIncluded only with items the brief states or that are clearly outside the brief.",
    "- faq: 4 to 6 useful questions and answers grounded in the brief.",
  ];
  if (brief.ctaType === "whatsapp") {
    lines.push(
      "- cta.prefill: a short first message the traveller sends on WhatsApp to ask about this trip, written in the traveller's voice. Do not add codes in brackets.",
    );
  }
  lines.push("", "Do not include images, video, media references or links.");
  if (context.example !== undefined) {
    lines.push(
      "",
      "Style example: the following JSON is an existing page of the same site. Match its style, length and tone, but not its facts.",
      "<style_example>",
      JSON.stringify(context.example, null, 2),
      "</style_example>",
    );
  }
  return lines.join("\n");
}

/** Mensaje de usuario con el brief (sin el precio: el modelo nunca lo escribe). */
export function buildUserMessage(brief: LandingBrief): string {
  return [
    "Write the landing page for this product.",
    "",
    `Trip length: ${brief.days} ${brief.days === 1 ? "day" : "days"}.`,
    `Traveller segment: ${brief.segment}.`,
    `Main call to action: ${brief.ctaType === "whatsapp" ? "write to us on WhatsApp" : "fill in the contact form"}.`,
    `Guide price shown by the template: ${brief.priceFrom === undefined ? "no" : "yes (do not mention it)"}.`,
    "",
    "<product_facts>",
    brief.facts,
    "</product_facts>",
  ].join("\n");
}

/** Turno de corrección con los errores de validación del intento anterior. */
export function buildRetryMessage(errors: readonly string[]): string {
  return [
    "Your previous answer failed validation. Fix every error below and return the complete JSON object again.",
    "",
    ...errors.map((error) => `- ${error}`),
  ].join("\n");
}
