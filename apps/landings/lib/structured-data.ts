import type {
  FAQPage,
  Graph,
  ItemList,
  ListItem,
  Offer,
  Organization,
  PriceSpecification,
  Question,
  Thing,
  TouristTrip,
} from "schema-dts";
import type { LandingContent, ResolvedInstanceConfig } from "@tla/shared";
import type { LandingView } from "./view.js";

/**
 * URLs de landing: canónica con dominio cuando la instancia lo tiene, o ruta
 * relativa en `draft` sin dominio (AGENTS.md: ni dominios ni países en el
 * motor, siempre a partir de la configuración resuelta).
 */
export function siteUrl(instance: ResolvedInstanceConfig): string | undefined {
  const domain = instance.brand.domain.trim();
  return domain === "" ? undefined : `https://${domain}`;
}

/** URL canónica de una landing: `<siteUrl>/<slug>`, o `/<slug>` sin dominio. */
export function canonicalUrl(instance: ResolvedInstanceConfig, slug: string): string {
  const base = siteUrl(instance);
  return base === undefined ? `/${slug}` : `${base}/${slug}`;
}

function buildOrganization(instance: ResolvedInstanceConfig): Organization {
  const url = siteUrl(instance);
  return {
    "@type": "Organization",
    name: instance.brand.displayName,
    legalName: instance.partner.legalName,
    ...(url !== undefined ? { url } : {}),
  };
}

function buildItinerary(landing: LandingContent): ItemList | undefined {
  if (!landing.itinerary?.length) return undefined;
  const itemListElement: ListItem[] = landing.itinerary.map((item) => ({
    "@type": "ListItem",
    position: item.day,
    name: item.title,
    item: { "@type": "Thing", name: item.title, description: item.description },
  }));
  return { "@type": "ItemList", itemListElement };
}

/**
 * `Offer` con precio orientativo: solo `PriceSpecification` (`minPrice`,
 * `priceCurrency`) y el `priceDisclaimer` del pack como `description`. Sin
 * `price` ni `availability` (AGENTS.md regla 2: nunca confirmamos precio ni
 * disponibilidad al viajero).
 */
function buildOffer(landing: LandingContent, instance: ResolvedInstanceConfig): Offer | undefined {
  if (!landing.priceGuidance) return undefined;
  const priceSpecification: PriceSpecification = {
    "@type": "PriceSpecification",
    minPrice: landing.priceGuidance.from,
    priceCurrency: instance.market.currency,
  };
  return {
    "@type": "Offer",
    priceSpecification,
    description: instance.marketPack.priceDisclaimer,
  };
}

function buildFaqPage(view: LandingView, canonical: string): FAQPage | undefined {
  const faqSection = view.sections.find((section) => section.kind === "faq");
  if (!faqSection || faqSection.items.length === 0) return undefined;
  const mainEntity: Question[] = faqSection.items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  }));
  return { "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity };
}

/**
 * Grafo JSON-LD de una landing: `TouristTrip` (con `Offer` y `itinerary` si
 * la landing los tiene), `FAQPage` solo con las preguntas que la página
 * muestra de verdad, y la `Organization` de la instancia. Nada de nombres de
 * país, moneda ni dominio literales: todo sale de `instance` y `landing`.
 */
export function buildLandingGraph(
  landing: LandingContent,
  instance: ResolvedInstanceConfig,
  view: LandingView,
): Graph {
  const canonical = canonicalUrl(instance, landing.slug);
  const organization = buildOrganization(instance);
  const itinerary = buildItinerary(landing);
  const offer = buildOffer(landing, instance);

  const touristTrip: TouristTrip = {
    "@type": "TouristTrip",
    "@id": canonical,
    name: landing.seo.title,
    description: landing.seo.description,
    url: canonical,
    provider: organization,
    ...(itinerary !== undefined ? { itinerary } : {}),
    ...(offer !== undefined ? { offers: offer } : {}),
  };

  const faqPage = buildFaqPage(view, canonical);

  const graph: Thing[] = [touristTrip, organization, ...(faqPage !== undefined ? [faqPage] : [])];
  return { "@context": "https://schema.org", "@graph": graph };
}
