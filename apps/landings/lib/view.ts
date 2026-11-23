import type {
  LandingContent,
  LandingFaqItem,
  LandingMediaKind,
  LandingSection,
  ResolvedInstanceConfig,
} from "@tla/shared";
import { formatDay, formatPhoneForMarket, formatPriceFrom, whatsappHref } from "./format.js";

/**
 * Vista de UI de una landing: datos ya resueltos (textos del pack de
 * mercado, precio formateado, enlaces) para que los componentes no lean
 * configuración. Solo incluye las secciones con datos.
 */

export interface HeroMediaView {
  src: string;
  kind: LandingMediaKind;
  poster?: string;
  alt: string;
  /** Etiqueta visible de contenido generado con IA; solo si `aiGenerated`. */
  aiLabel?: string;
}

export interface HeroView {
  headline: string;
  subheadline?: string;
  media?: HeroMediaView;
}

export interface ItineraryDayView {
  day: number;
  label: string;
  title: string;
  description: string;
}

export type SectionView =
  | { kind: "itinerary"; title: string; days: ItineraryDayView[] }
  | {
      kind: "includes";
      title: string;
      includedLabel: string;
      included: string[];
      notIncludedLabel: string;
      notIncluded: string[];
    }
  | { kind: "bestSeason"; title: string; summary: string }
  | { kind: "priceGuidance"; title: string; priceText: string; disclaimer: string }
  | { kind: "faq"; title: string; items: LandingFaqItem[] }
  | {
      kind: "trust";
      title: string;
      phone?: { label: string; display: string; href: string };
      agency?: { label: string; name: string };
    }
  | { kind: "cta"; label: string; href: string };

export interface LandingView {
  hero: HeroView;
  /** Secciones en el orden de `landing.sections`, sin duplicados ni secciones vacías. */
  sections: SectionView[];
}

function buildSection(
  section: LandingSection,
  landing: LandingContent,
  instance: ResolvedInstanceConfig,
): SectionView | undefined {
  const ui = instance.marketPack.landingUi;
  const titles = ui.sectionTitles;

  switch (section) {
    case "itinerary": {
      if (!landing.itinerary?.length) return undefined;
      return {
        kind: "itinerary",
        title: titles.itinerary,
        days: landing.itinerary.map((item) => ({
          day: item.day,
          label: formatDay(item.day, ui.dayLabel),
          title: item.title,
          description: item.description,
        })),
      };
    }
    case "includes": {
      if (!landing.includes?.included.length) return undefined;
      return {
        kind: "includes",
        title: titles.includes,
        includedLabel: ui.includedLabel,
        included: landing.includes.included,
        notIncludedLabel: ui.notIncludedLabel,
        notIncluded: landing.includes.notIncluded ?? [],
      };
    }
    case "bestSeason": {
      if (!landing.bestSeason) return undefined;
      return { kind: "bestSeason", title: titles.bestSeason, summary: landing.bestSeason.summary };
    }
    case "priceGuidance": {
      if (!landing.priceGuidance) return undefined;
      return {
        kind: "priceGuidance",
        title: titles.priceGuidance,
        priceText: formatPriceFrom(landing.priceGuidance.from, {
          locale: instance.market.locale,
          currency: instance.market.currency,
          template: ui.priceFrom,
        }),
        // Siempre con el aviso de precio orientativo del pack (AGENTS.md, regla 2).
        disclaimer: instance.marketPack.priceDisclaimer,
      };
    }
    case "faq": {
      if (!landing.faq?.length) return undefined;
      return { kind: "faq", title: titles.faq, items: landing.faq };
    }
    case "trust": {
      const number = instance.channels.whatsapp.number.trim();
      const display = formatPhoneForMarket(number, instance.market.phoneDefaultRegion);
      const legalName = instance.agency.legalName.trim();
      if (display === undefined && legalName === "") return undefined;
      return {
        kind: "trust",
        title: titles.trust,
        ...(display !== undefined
          ? { phone: { label: ui.trust.phoneLabel, display, href: `tel:${number.replace(/[^\d+]/g, "")}` } }
          : {}),
        ...(legalName !== "" ? { agency: { label: ui.trust.agencyLabel, name: legalName } } : {}),
      };
    }
    case "cta": {
      // Solo hay CTA de WhatsApp por ahora; el formulario llegará en otro ticket.
      if (landing.cta.type !== "whatsapp") return undefined;
      const href = whatsappHref(instance.channels.whatsapp.number, landing.cta.prefill);
      if (href === undefined) return undefined;
      return { kind: "cta", label: ui.whatsappCta, href };
    }
  }
}

/** Construye la vista de la landing a partir de su contenido y la configuración resuelta. */
export function buildLandingView(landing: LandingContent, instance: ResolvedInstanceConfig): LandingView {
  const media = landing.hero.media;
  const hero: HeroView = {
    headline: landing.hero.headline,
    ...(landing.hero.subheadline !== undefined ? { subheadline: landing.hero.subheadline } : {}),
    ...(media
      ? {
          media: {
            src: media.src,
            kind: media.kind,
            ...(media.poster !== undefined ? { poster: media.poster } : {}),
            alt: media.alt,
            ...(media.aiGenerated ? { aiLabel: instance.marketPack.landingUi.aiImageLabel } : {}),
          },
        }
      : {}),
  };

  const sections: SectionView[] = [];
  for (const section of new Set(landing.sections)) {
    const view = buildSection(section, landing, instance);
    if (view) sections.push(view);
  }
  return { hero, sections };
}
