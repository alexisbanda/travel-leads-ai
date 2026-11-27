import {
  brandName,
  type LandingContent,
  type LandingFaqItem,
  type LandingMediaKind,
  type LandingSection,
  type ResolvedInstanceConfig,
} from "@tla/shared";
import { formatDay, formatPhoneForMarket, formatPriceFrom, whatsappHref } from "./format.js";
import { firebaseProjectId, leadEndpointUrl, type LeadEndpointEnv } from "./lead-endpoint.js";
import type { LeadFormView } from "./lead-form.js";
import { checkMedia, type CheckMediaOptions, type MediaRef } from "./media.js";

/** Comprobación de medios para una vista; sin ella no se verifica existencia (uso en tests). */
export type MediaCheck = CheckMediaOptions;

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
  /** Punto focal del recorte, como valor CSS de `object-position` (p. ej. `74% 45%`). */
  objectPosition?: string;
  /** Etiquetas del control de reproducción (`landingUi.videoPlay`/`videoPause`); solo en vídeos. */
  controls?: { play: string; pause: string };
}

/** Ancla del bloque de contacto (formulario o botón de WhatsApp). */
export const CONTACT_ANCHOR = "contact";

export interface HeroView {
  headline: string;
  subheadline?: string;
  media?: HeroMediaView;
  /** Chips del hero (`highlights` del contenido). */
  highlights?: string[];
  /**
   * Botón principal (`landingUi.heroCta`) hacia el bloque de contacto. Solo
   * si la landing tiene formulario o botón de WhatsApp; lo reutiliza la
   * barra fija de contacto en móvil.
   */
  cta?: { label: string; href: string };
}

export interface GalleryImageView {
  src: string;
  alt: string;
  /** Etiqueta visible de contenido generado con IA; solo si `aiGenerated`. */
  aiLabel?: string;
}

export interface ItineraryDayView {
  day: number;
  label: string;
  title: string;
  description: string;
}

export type SectionView =
  | { kind: "itinerary"; title: string; days: ItineraryDayView[] }
  | { kind: "gallery"; title: string; images: GalleryImageView[] }
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
  | { kind: "cta"; label: string; href: string }
  | { kind: "form"; form: LeadFormView };

export interface LandingView {
  hero: HeroView;
  /** Secciones en el orden de `landing.sections`, sin duplicados ni secciones vacías. */
  sections: SectionView[];
}

export interface BuildLandingViewOptions {
  /** Entorno del servidor (`process.env`): `LEAD_ENDPOINT_URL` y `TLA_ENV`. */
  env?: LeadEndpointEnv;
  /**
   * Comprobación de `hero.media.src`/`poster` y de las imágenes de `gallery`
   * contra `instances/<id>/content/media`. Sin ella, el hero y la galería se
   * construyen tal cual (uso en tests unitarios de la vista).
   */
  media?: MediaCheck;
}

/**
 * Formulario de lead. Sin región o proyecto en la config no hay endpoint: no
 * se renderiza y se avisa en el servidor (sin PII). En draft las claves web
 * pueden venir vacías: se renderiza igual y el envío acaba en error genérico.
 */
function buildFormSection(
  landing: LandingContent,
  instance: ResolvedInstanceConfig,
  env: LeadEndpointEnv,
): SectionView | undefined {
  const endpoint = leadEndpointUrl(instance, env);
  if (endpoint === undefined) {
    console.warn(
      `apps/landings: sin infra.region o infra.firebaseProjects en ${instance.id}; la landing ${landing.slug} se publica sin formulario de lead.`,
    );
    return undefined;
  }
  const { version, privacyNotice, commercialConsent, marketingConsent, privacyPageSlug, pages } =
    instance.marketPack.legalTexts;
  const web = instance.channels.web;
  const href = whatsappHref(instance.channels.whatsapp.number, landing.cta.prefill);
  // El pack de mercado garantiza (market-pack.ts) que privacyPageSlug coincide con una página.
  const privacyPage = pages.find((page) => page.slug === privacyPageSlug)!;
  return {
    kind: "form",
    form: {
      texts: instance.marketPack.landingUi.form,
      legal: {
        version,
        privacyNotice,
        commercialConsent,
        ...(marketingConsent !== undefined ? { marketingConsent } : {}),
      },
      privacyPage: { slug: privacyPage.slug, title: privacyPage.title },
      phoneDefaultRegion: instance.market.phoneDefaultRegion,
      endpoint,
      appCheck: {
        apiKey: web.firebaseApiKey,
        appId: web.firebaseAppId,
        projectId: firebaseProjectId(instance, env) ?? "",
        recaptchaSiteKey: web.recaptchaSiteKey,
      },
      landingSlug: landing.slug,
      tourIds: [...landing.tourIds],
      ...(href !== undefined ? { whatsappHref: href } : {}),
    },
  };
}

function buildSection(
  section: LandingSection,
  landing: LandingContent,
  instance: ResolvedInstanceConfig,
  env: LeadEndpointEnv,
  isAvailable: (ref: string) => boolean,
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
    case "gallery": {
      const images = (landing.gallery ?? [])
        .filter((image) => isAvailable(image.src))
        .map((image) => ({
          src: image.src,
          alt: image.alt,
          ...(image.aiGenerated ? { aiLabel: ui.aiImageLabel } : {}),
        }));
      if (images.length === 0) return undefined;
      return { kind: "gallery", title: titles.gallery, images };
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
      if (landing.cta.type === "form") return buildFormSection(landing, instance, env);
      const href = whatsappHref(instance.channels.whatsapp.number, landing.cta.prefill);
      if (href === undefined) return undefined;
      return { kind: "cta", label: ui.whatsappCta, href };
    }
  }
}

/** Construye la vista de la landing a partir de su contenido y la configuración resuelta. */
export function buildLandingView(
  landing: LandingContent,
  instance: ResolvedInstanceConfig,
  options: BuildLandingViewOptions = {},
): LandingView {
  const media = landing.hero.media;
  const ui = instance.marketPack.landingUi;
  const refs: MediaRef[] = [];
  if (media) {
    refs.push({ ref: media.src, context: `landing ${landing.slug} (hero.media.src)` });
    if (media.poster !== undefined) {
      refs.push({ ref: media.poster, context: `landing ${landing.slug} (hero.media.poster)` });
    }
  }
  if (landing.sections.includes("gallery")) {
    (landing.gallery ?? []).forEach((image, index) => {
      refs.push({ ref: image.src, context: `landing ${landing.slug} (gallery[${index}].src)` });
    });
  }
  const availableMedia = options.media && refs.length > 0 ? checkMedia(refs, options.media) : undefined;
  const isAvailable = (ref: string) => availableMedia === undefined || availableMedia.has(ref);

  const sections: SectionView[] = [];
  for (const section of new Set(landing.sections)) {
    const view = buildSection(section, landing, instance, options.env ?? {}, isAvailable);
    if (view) sections.push(view);
  }
  const hasContact = sections.some((section) => section.kind === "form" || section.kind === "cta");

  const srcOk = media !== undefined && isAvailable(media.src);
  const posterOk = media?.poster !== undefined && isAvailable(media.poster);
  const hero: HeroView = {
    headline: landing.hero.headline,
    ...(landing.hero.subheadline !== undefined ? { subheadline: landing.hero.subheadline } : {}),
    ...(media && srcOk
      ? {
          media: {
            src: media.src,
            kind: media.kind,
            ...(media.poster !== undefined && posterOk ? { poster: media.poster } : {}),
            alt: media.alt,
            ...(media.aiGenerated ? { aiLabel: ui.aiImageLabel } : {}),
            ...(media.focus ? { objectPosition: `${media.focus.x}% ${media.focus.y}%` } : {}),
            ...(media.kind === "video" ? { controls: { play: ui.videoPlay, pause: ui.videoPause } } : {}),
          },
        }
      : {}),
    ...(landing.highlights?.length ? { highlights: [...landing.highlights] } : {}),
    ...(hasContact ? { cta: { label: ui.heroCta, href: `#${CONTACT_ANCHOR}` } } : {}),
  };

  return { hero, sections };
}

/** Vista de la cabecera: logo de marca, o su nombre en texto si no hay logo. */
export interface HeaderView {
  logo?: string;
  name: string;
}

export interface BuildHeaderViewOptions {
  /** Comprobación de `brand.logo`; sin ella no se verifica existencia (uso en tests). */
  media?: MediaCheck;
}

/**
 * Cabecera de la instancia (AGENTS.md: nada de nombres fijos en el código).
 * `brandName` ya aplica el mismo criterio que el resto del motor: `displayName`
 * y, si está vacío, el nombre de la instancia.
 */
export function buildHeaderView(
  instance: ResolvedInstanceConfig,
  options: BuildHeaderViewOptions = {},
): HeaderView {
  const name = brandName(instance);
  const logo = instance.brand.logo.trim();
  if (logo === "") return { name };
  if (options.media) {
    const available = checkMedia([{ ref: logo, context: "brand.logo" }], options.media);
    if (!available.has(logo)) return { name };
  }
  return { logo, name };
}

/** Vista del pie: un enlace por página legal del pack de mercado y las razones sociales presentes. */
export interface FooterView {
  links: Array<{ slug: string; title: string }>;
  legalNames: string[];
}

/** Pie de la instancia: enlaces `/legal/<slug>` y razón social de agencia/socio (sin duplicar). */
export function buildFooterView(instance: ResolvedInstanceConfig): FooterView {
  const links = instance.marketPack.legalTexts.pages.map(({ slug, title }) => ({ slug, title }));
  const names = [instance.partner.legalName.trim(), instance.agency.legalName.trim()].filter(
    (name) => name !== "",
  );
  return { links, legalNames: [...new Set(names)] };
}
