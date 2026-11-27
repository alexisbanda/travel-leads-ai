// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import type { LandingContent, ResolvedInstanceConfig } from "@tla/shared";
import { BASE_RESOLVED_INSTANCE, buildFullLanding, withResolvedInstance } from "../lib/test-fixtures.js";
import { buildLandingView } from "../lib/view.js";
import { Hero } from "./Hero.js";
import { LandingView } from "./LandingView.js";
import { WhatsAppCTA } from "./WhatsAppCTA.js";

afterEach(cleanup);

const ui = BASE_RESOLVED_INSTANCE.marketPack.landingUi;
const titles = ui.sectionTitles;

function renderLanding(landing: LandingContent, instance: ResolvedInstanceConfig = BASE_RESOLVED_INSTANCE) {
  return render(<LandingView view={buildLandingView(landing, instance)} />);
}

/** Títulos `<h2>` de las secciones, en orden de aparición en el DOM. */
function sectionHeadings(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("section h2")).map((h) => h.textContent ?? "");
}

describe("orden de secciones", () => {
  it("renderiza las secciones en el orden de `sections` (FAQ antes que itinerario)", () => {
    const { container } = renderLanding(buildFullLanding({ sections: ["faq", "itinerary"] }));
    expect(sectionHeadings(container)).toEqual([titles.faq, titles.itinerary]);
  });

  it("oculta una sección listada sin datos y las no listadas", () => {
    const { container } = renderLanding(
      buildFullLanding({ sections: ["bestSeason", "faq", "itinerary"], bestSeason: undefined }),
    );
    expect(sectionHeadings(container)).toEqual([titles.faq, titles.itinerary]);
    expect(container.textContent).not.toContain(titles.bestSeason);
    expect(container.textContent).not.toContain(titles.priceGuidance);
  });

  it("el hero va siempre primero", () => {
    const { container } = renderLanding(buildFullLanding());
    const main = container.querySelector("main");
    expect(main?.firstElementChild?.tagName).toBe("HEADER");
    expect(main?.querySelector("h1")?.textContent).toBe("Titular de ejemplo");
  });

  it("oculta Trust si no hay número ni razón social, y el CTA si no hay número", () => {
    const instance = withResolvedInstance((c) => {
      c.channels.whatsapp.number = "";
      c.agency.legalName = "";
    });
    const { container } = renderLanding(buildFullLanding(), instance);
    expect(sectionHeadings(container)).not.toContain(titles.trust);
    expect(container.querySelector('a[href^="https://wa.me/"]')).toBeNull();
  });
});

describe("PriceGuidance", () => {
  const instance = withResolvedInstance((c) => {
    c.market.locale = "es-ES"; // hardcoding-ok: valor de prueba
    c.market.currency = "EUR"; // hardcoding-ok: valor de prueba
    c.marketPack.landingUi.priceFrom = "Desde {price} por persona";
  });

  it("muestra el precio formateado con Intl y siempre el priceDisclaimer", () => {
    const { getByRole } = renderLanding(buildFullLanding({ priceGuidance: { from: 2490 } }), instance);
    const section = getByRole("region", { name: titles.priceGuidance });
    const text = (section.textContent ?? "").replace(/\s/g, " ");
    expect(text).toContain("Desde 2490 € por persona"); // hardcoding-ok: valor esperado de prueba
    expect(section.textContent).toContain(instance.marketPack.priceDisclaimer);
  });

  it("la página no contiene palabras de confirmación de precio, disponibilidad o reserva", () => {
    const { container } = renderLanding(buildFullLanding(), instance);
    const html = container.innerHTML.split(instance.marketPack.priceDisclaimer).join("");
    const forbidden = /reserva confirmada|confirmad[oa]|disponible|disponibilidad|garantizad[oa]|plazas libres/i;
    expect(html).not.toMatch(forbidden);
  });
});

describe("WhatsAppCTA", () => {
  it("codifica el prefill en el href de wa.me", () => {
    const instance = withResolvedInstance((c) => {
      c.channels.whatsapp.number = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
    });
    const landing = buildFullLanding({
      sections: ["cta"],
      cta: { type: "whatsapp", prefill: "Hola, me interesa Galápagos [GAL-01]" }, // hardcoding-ok: texto de prueba del ticket
    });
    const { getByRole } = renderLanding(landing, instance);
    const link = getByRole("link", { name: ui.whatsappCta });
    expect(link.getAttribute("href")).toBe(
      "https://wa.me/34600000000?text=Hola%2C%20me%20interesa%20Gal%C3%A1pagos%20%5BGAL-01%5D",
    );
  });

  it("renderiza el texto del botón recibido", () => {
    const { getByRole } = render(<WhatsAppCTA label="Botón de ejemplo" href="https://wa.me/1" />);
    expect(getByRole("link", { name: "Botón de ejemplo" }).getAttribute("href")).toBe("https://wa.me/1");
  });
});

describe("Hero", () => {
  it("vídeo con portada prioritaria y preload=none, sin autoplay si no hay matchMedia", () => {
    const { container } = render(
      <Hero
        headline="Titular"
        media={{ src: "/v.mp4", kind: "video", poster: "/p.jpg", alt: "Alt", controls: { play: "Play", pause: "Pausa" } }}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("none");
    expect(video?.hasAttribute("autoplay")).toBe(false);
    // La portada la pinta next/image (LCP), no el atributo poster del vídeo.
    expect(container.querySelector('img[src*="p.jpg"]')).not.toBeNull();
  });

  it("imagen con el alt del contenido", () => {
    const { getByRole } = render(<Hero headline="Titular" media={{ src: "/i.jpg", kind: "image", alt: "Alt" }} />);
    expect(getByRole("img", { name: "Alt" })).toBeTruthy();
  });

  it("imagen con fetchpriority alta (LCP del hero, además de priority)", () => {
    const { getByRole } = render(<Hero headline="Titular" media={{ src: "/i.jpg", kind: "image", alt: "Alt" }} />);
    expect(getByRole("img", { name: "Alt" }).getAttribute("fetchpriority")).toBe("high");
  });

  it("aiGenerated: true → etiqueta visible con aiImageLabel", () => {
    const landing = buildFullLanding({
      hero: { headline: "Titular", media: { src: "/i.jpg", kind: "image", alt: "Alt", aiGenerated: true } },
    });
    const { container } = renderLanding(landing);
    const header = container.querySelector("header") as HTMLElement;
    expect(within(header).getByText(ui.aiImageLabel)).toBeTruthy();
  });

  it("aiGenerated: false → sin etiqueta", () => {
    const { container } = renderLanding(buildFullLanding());
    expect(container.textContent).not.toContain(ui.aiImageLabel);
  });
});

describe("Trust", () => {
  it("muestra el número formateado (internacional) y la razón social de la config", () => {
    const instance = withResolvedInstance((c) => {
      c.channels.whatsapp.number = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
      c.agency.legalName = "Agencia Ficticia S.L.";
    });
    const { getByRole } = renderLanding(buildFullLanding(), instance);
    const section = getByRole("region", { name: titles.trust });
    expect(within(section).getByText(ui.trust.phoneLabel)).toBeTruthy();
    expect(within(section).getByRole("link", { name: "+34 600 00 00 00" }).getAttribute("href")).toBe( // hardcoding-ok: valor esperado de prueba
      "tel:+34600000000", // hardcoding-ok: número ficticio de pruebas
    );
    expect(within(section).getByText(ui.trust.agencyLabel)).toBeTruthy();
    expect(within(section).getByText("Agencia Ficticia S.L.")).toBeTruthy();
  });
});

describe("accesibilidad (axe)", () => {
  it("la página completa no tiene violaciones serious ni critical", async () => {
    const landing = buildFullLanding({
      hero: { headline: "Titular", media: { src: "/i.jpg", kind: "image", alt: "Alt", aiGenerated: true } },
    });
    const pages = [renderLanding(buildFullLanding()).container, renderLanding(landing).container];
    for (const container of pages) {
      const results = await axe.run(container);
      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help}`);
      expect(blocking).toEqual([]);
    }
  });

  it("control: axe detecta un campo sin etiqueta (el arnés funciona en jsdom)", async () => {
    const { container } = render(
      <main>
        <input type="text" />
      </main>,
    );
    const results = await axe.run(container);
    expect(results.violations.map((v) => v.id)).toContain("label");
  });
});
