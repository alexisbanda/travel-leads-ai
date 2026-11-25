// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LandingContent } from "@tla/shared";
import { buildLandingGraph } from "../lib/structured-data.js";
import { buildFullLanding, buildLanding, withResolvedInstance } from "../lib/test-fixtures.js";
import { buildLandingView } from "../lib/view.js";
import { JsonLdScript } from "./JsonLdScript.js";

afterEach(cleanup);

const instance = withResolvedInstance(() => {});

/** Nodo JSON-LD ya parseado: solo lo que necesita el test, sin el tipado estricto de schema-dts. */
interface ParsedNode {
  "@type"?: string;
  [key: string]: unknown;
}
interface ParsedGraph {
  "@context": string;
  "@graph": ParsedNode[];
}

/**
 * Renderiza `JsonLdScript` para una landing (como hace `app/[slug]/page.tsx`)
 * y devuelve el JSON-LD ya parseado, tal y como lo leería un buscador o un
 * agente de IA desde el HTML servido.
 */
function renderGraph(landing: LandingContent): ParsedGraph {
  const view = buildLandingView(landing, instance);
  const graph = buildLandingGraph(landing, instance, view);
  const { container } = render(<JsonLdScript graph={graph} />);
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return JSON.parse(script!.innerHTML) as ParsedGraph;
}

describe("JsonLdScript", () => {
  it("renderiza un único <script type=application/ld+json> por landing, parseable", () => {
    for (const landing of [buildLanding(), buildFullLanding()]) {
      const parsed = renderGraph(landing);
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(Array.isArray(parsed["@graph"])).toBe(true);
      cleanup();
    }
  });

  it("el Offer de una landing completa tiene PriceSpecification y nunca price ni availability", () => {
    const parsed = renderGraph(buildFullLanding());
    const touristTrip = parsed["@graph"].find((node) => node["@type"] === "TouristTrip") as
      | { offers?: Record<string, unknown> }
      | undefined;
    expect(touristTrip?.offers).toMatchObject({
      "@type": "Offer",
      priceSpecification: { "@type": "PriceSpecification" },
    });
    expect(touristTrip?.offers).not.toHaveProperty("price");
    expect(touristTrip?.offers).not.toHaveProperty("availability");
  });

  it("escapa `</script>` dentro de un texto de la landing (sin romper el HTML)", () => {
    const landing = buildLanding({
      sections: ["faq", "cta"],
      faq: [{ q: "¿Puedo </script> esto?", a: "Sí, se escapa." }],
    });
    const view = buildLandingView(landing, instance);
    const graph = buildLandingGraph(landing, instance, view);
    const { container } = render(<JsonLdScript graph={graph} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script!.innerHTML).not.toContain("</script>");
    const parsed = JSON.parse(script!.innerHTML) as ParsedGraph;
    const faqPage = parsed["@graph"].find((node) => node["@type"] === "FAQPage") as
      | { mainEntity: Array<{ name: string }> }
      | undefined;
    expect(faqPage?.mainEntity[0]?.name).toBe("¿Puedo </script> esto?");
  });
});
