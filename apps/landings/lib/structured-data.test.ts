import { describe, expect, it } from "vitest";
import type { FAQPage, Organization, Thing, TouristTrip } from "schema-dts";
import { buildLandingGraph, canonicalUrl, siteUrl } from "./structured-data.js";
import { buildLandingView } from "./view.js";
import { buildFullLanding, buildLanding, withResolvedInstance } from "./test-fixtures.js";

const instance = withResolvedInstance(() => {});

// `Thing` incluye `string` (vía `Organization`), así que `"@type" in node` no
// es seguro sin comprobar antes que es un objeto.
function hasType<T extends Thing>(
  node: Thing,
  type: string,
): node is Extract<T, { "@type": string }> {
  return typeof node === "object" && node !== null && (node as { "@type"?: unknown })["@type"] === type;
}

describe("siteUrl", () => {
  it("con dominio, devuelve https://<domain>", () => {
    expect(siteUrl(instance)).toBe("https://ejemplo.test");
  });

  it("con brand.domain vacío, devuelve undefined", () => {
    const withoutDomain = withResolvedInstance((clone) => {
      clone.brand.domain = "";
    });
    expect(siteUrl(withoutDomain)).toBeUndefined();
  });
});

describe("canonicalUrl", () => {
  it("con dominio, devuelve la URL absoluta", () => {
    expect(canonicalUrl(instance, "ejemplo")).toBe("https://ejemplo.test/ejemplo");
  });

  it("sin dominio, devuelve la ruta relativa", () => {
    const withoutDomain = withResolvedInstance((clone) => {
      clone.brand.domain = "";
    });
    expect(canonicalUrl(withoutDomain, "ejemplo")).toBe("/ejemplo");
  });
});

describe("buildLandingGraph", () => {
  it("incluye TouristTrip, Offer con PriceSpecification (sin price ni availability) y Organization", () => {
    const landing = buildFullLanding();
    const view = buildLandingView(landing, instance);
    const graph = buildLandingGraph(landing, instance, view);

    expect(graph["@context"]).toBe("https://schema.org");
    const touristTrip = graph["@graph"].find((node) => hasType<TouristTrip>(node, "TouristTrip"));
    expect(touristTrip).toBeDefined();
    expect(touristTrip?.name).toBe(landing.seo.title);
    expect(touristTrip?.description).toBe(landing.seo.description);
    expect(touristTrip?.url).toBe("https://ejemplo.test/ejemplo");

    const offer = touristTrip?.offers;
    expect(offer).toMatchObject({
      "@type": "Offer",
      priceSpecification: {
        "@type": "PriceSpecification",
        minPrice: landing.priceGuidance!.from,
        priceCurrency: instance.market.currency,
      },
      description: instance.marketPack.priceDisclaimer,
    });
    expect(offer).not.toHaveProperty("price");
    expect(offer).not.toHaveProperty("availability");

    const organization = graph["@graph"].find((node) => hasType<Organization>(node, "Organization"));
    expect(organization).toMatchObject({
      name: instance.brand.displayName,
      url: "https://ejemplo.test",
      legalName: instance.partner.legalName,
    });

    const json = JSON.stringify(graph);
    expect(json).not.toContain('"price"');
    expect(json).not.toContain('"availability"');
  });

  it("sin priceGuidance, no hay Offer", () => {
    const landing = buildLanding({ sections: ["faq", "cta"], priceGuidance: undefined });
    const view = buildLandingView(landing, instance);
    const graph = buildLandingGraph(landing, instance, view);
    const touristTrip = graph["@graph"].find((node) => hasType<TouristTrip>(node, "TouristTrip"));
    expect(touristTrip?.offers).toBeUndefined();
  });

  it("Organization sin url cuando brand.domain está vacío", () => {
    const withoutDomain = withResolvedInstance((clone) => {
      clone.brand.domain = "";
    });
    const landing = buildLanding({ sections: ["cta"] });
    const view = buildLandingView(landing, withoutDomain);
    const graph = buildLandingGraph(landing, withoutDomain, view);
    const organization = graph["@graph"].find((node) => hasType<Organization>(node, "Organization"));
    expect(organization).not.toHaveProperty("url");
  });

  it("con FAQ visible, FAQPage tiene exactamente las preguntas mostradas", () => {
    const landing = buildLanding({
      sections: ["faq", "cta"],
      faq: [
        { q: "Pregunta uno", a: "Respuesta uno." },
        { q: "Pregunta dos", a: "Respuesta dos." },
      ],
    });
    const view = buildLandingView(landing, instance);
    const graph = buildLandingGraph(landing, instance, view);
    const faqPage = graph["@graph"].find((node) => hasType<FAQPage>(node, "FAQPage"));
    expect(faqPage?.mainEntity).toHaveLength(2);
  });

  it("sin sección faq, no hay FAQPage", () => {
    const landing = buildLanding({ sections: ["cta"], faq: undefined });
    const view = buildLandingView(landing, instance);
    const graph = buildLandingGraph(landing, instance, view);
    const faqPage = graph["@graph"].find((node) => hasType<FAQPage>(node, "FAQPage"));
    expect(faqPage).toBeUndefined();
  });
});
