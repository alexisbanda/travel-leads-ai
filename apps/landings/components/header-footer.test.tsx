// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_RESOLVED_INSTANCE, withResolvedInstance } from "../lib/test-fixtures.js";
import { buildFooterView, buildHeaderView } from "../lib/view.js";
import { DraftBanner } from "./DraftBanner.js";
import { Footer } from "./Footer.js";
import { Header } from "./Header.js";

afterEach(cleanup);

describe("Header", () => {
  it("con brand.logo, pinta una imagen con alt = nombre de marca", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "/media/logo.png";
    });
    render(<Header {...buildHeaderView(instance)} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("Marca de ejemplo");
  });

  it("sin brand.logo, pinta el nombre de marca en texto (sin imagen)", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "";
    });
    render(<Header {...buildHeaderView(instance)} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Marca de ejemplo")).toBeTruthy();
  });

  it("en draft con brand.logo y displayName vacíos, no lanza y muestra instance.name", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "";
      c.brand.displayName = "";
      c.name = "Instancia de ejemplo";
      c.status = "draft";
    });
    expect(() => render(<Header {...buildHeaderView(instance)} />)).not.toThrow();
    expect(screen.getByText("Instancia de ejemplo")).toBeTruthy();
  });

  it("es el landmark banner de la página", () => {
    render(<Header {...buildHeaderView(BASE_RESOLVED_INSTANCE)} />);
    expect(screen.getByRole("banner")).toBeTruthy();
  });
});

describe("Footer", () => {
  it("un enlace /legal/<slug> por página legal, con su título", () => {
    render(<Footer {...buildFooterView(BASE_RESOLVED_INSTANCE)} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/legal/privacidad",
      "/legal/cookies",
      "/legal/aviso-legal",
    ]);
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toBeTruthy();
  });

  it("muestra la razón social de agencia y socio cuando están presentes", () => {
    render(<Footer {...buildFooterView(BASE_RESOLVED_INSTANCE)} />);
    expect(screen.getByText(/Socio de ejemplo/)).toBeTruthy();
    expect(screen.getByText(/Agencia de ejemplo/)).toBeTruthy();
  });

  it("sin razón social, no pinta ese bloque", () => {
    const instance = withResolvedInstance((c) => {
      c.agency.legalName = "";
      c.partner.legalName = "";
    });
    render(<Footer {...buildFooterView(instance)} />);
    expect(screen.queryByText("Agencia de ejemplo")).toBeNull();
    expect(screen.queryByText("Socio de ejemplo")).toBeNull();
  });

  it("es el landmark contentinfo de la página", () => {
    render(<Footer {...buildFooterView(BASE_RESOLVED_INSTANCE)} />);
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });
});

describe("DraftBanner", () => {
  it("muestra el aviso del pack de mercado además del icono", () => {
    render(<DraftBanner text={BASE_RESOLVED_INSTANCE.marketPack.landingUi.draftNotice} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(BASE_RESOLVED_INSTANCE.marketPack.landingUi.draftNotice);
    expect(status.textContent).toContain("⚠");
  });
});

/**
 * Página legal dentro del layout: cabecera, pie y el contenedor de ancho de
 * lectura con la misma tipografía que la landing (misma estructura que
 * `app/layout.tsx` + `app/legal/[slug]/page.tsx`).
 */
function renderLegalPageInLayout() {
  const header = buildHeaderView(BASE_RESOLVED_INSTANCE);
  const footer = buildFooterView(BASE_RESOLVED_INSTANCE);
  const page = BASE_RESOLVED_INSTANCE.marketPack.legalTexts.pages[0]!;
  return render(
    <>
      <Header {...header} />
      <main className="min-h-screen bg-white text-gray-900">
        <div className="mx-auto max-w-prose px-4 py-10">
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed">{page.body}</p>
        </div>
      </main>
      <Footer {...footer} />
    </>,
  );
}

describe("página legal dentro del layout", () => {
  it("tiene cabecera, pie y el contenedor de ancho de lectura", () => {
    const { container } = renderLegalPageInLayout();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(container.querySelector("main .max-w-prose")).toBeTruthy();
  });

  it("no tiene violaciones serious ni critical (axe)", async () => {
    const { container } = renderLegalPageInLayout();
    const results = await axe.run(container);
    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
});
