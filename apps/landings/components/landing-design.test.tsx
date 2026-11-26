// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_RESOLVED_INSTANCE, buildFullLanding } from "../lib/test-fixtures.js";
import { buildLandingView } from "../lib/view.js";
import { galleryItemClasses } from "./Gallery.js";
import { Hero } from "./Hero.js";
import { LandingView } from "./LandingView.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ui = BASE_RESOLVED_INSTANCE.marketPack.landingUi;
const controls = { play: ui.videoPlay, pause: ui.videoPause };
const gallery = [
  { src: "/media/g1.jpg", kind: "image" as const, alt: "Imagen de ejemplo uno", aiGenerated: false },
  { src: "/media/g2.jpg", kind: "image" as const, alt: "Imagen de ejemplo dos", aiGenerated: true },
  { src: "/media/g3.jpg", kind: "image" as const, alt: "Imagen de ejemplo tres", aiGenerated: false },
];

function renderView(landing = buildFullLanding()) {
  return render(<LandingView view={buildLandingView(landing, BASE_RESOLVED_INSTANCE)} />);
}

describe("Hero: highlights y CTA", () => {
  it("muestra los chips de highlights y el botón heroCta hacia #contact", () => {
    const { container, getByRole } = renderView(buildFullLanding({ highlights: ["Chip uno", "Chip dos"] }));
    const hero = container.querySelector("header#hero") as HTMLElement;
    expect(within(hero).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Chip uno", "Chip dos"]);
    const cta = within(hero).getByRole("link", { name: ui.heroCta });
    expect(cta.getAttribute("href")).toBe("#contact");
    // El destino del ancla existe y contiene el bloque de contacto.
    expect(container.querySelector("#contact a[href^='https://wa.me/']")).not.toBeNull();
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Titular de ejemplo");
  });

  it("sin highlights ni bloque de contacto, no hay chips ni botón", () => {
    const { container } = renderView(buildFullLanding({ sections: ["faq"] }));
    const hero = container.querySelector("header#hero") as HTMLElement;
    expect(within(hero).queryByRole("list")).toBeNull();
    expect(within(hero).queryByRole("link")).toBeNull();
  });

  it("imagen del hero con next/image prioritario (sin lazy) y su alt", () => {
    const { getByRole } = render(<Hero headline="Titular" media={{ src: "/i.jpg", kind: "image", alt: "Alt de ejemplo" }} />);
    const img = getByRole("img", { name: "Alt de ejemplo" });
    expect(img.getAttribute("loading")).not.toBe("lazy");
    expect(img.getAttribute("sizes")).toBe("100vw");
  });
});

describe("Hero: vídeo", () => {
  const media = { src: "/v.mp4", kind: "video" as const, poster: "/p.jpg", alt: "Alt", controls };
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    pause = vi.fn(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as never);
  });

  function stubMatchMedia(matches: boolean) {
    const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
    vi.stubGlobal("matchMedia", matchMedia);
    return matchMedia;
  }

  it("silenciado, en bucle, inline y preload=none", () => {
    stubMatchMedia(false);
    const { container } = render(<Hero headline="Titular" media={media} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.getAttribute("aria-label")).toBe("Alt");
  });

  it("en móvil o con movimiento reducido no se reproduce solo y ofrece reproducir", () => {
    const matchMedia = stubMatchMedia(false);
    const { container, getByRole } = render(<Hero headline="Titular" media={media} />);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    expect(container.querySelector("video")?.hasAttribute("autoplay")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    const button = getByRole("button", { name: ui.videoPlay });
    fireEvent.click(button);
    expect(play).toHaveBeenCalledTimes(1);
    expect(getByRole("button", { name: ui.videoPause })).toBeTruthy();
  });

  it("en escritorio sin movimiento reducido se reproduce solo y el botón permite pausar", async () => {
    stubMatchMedia(true);
    const { container, findByRole } = render(<Hero headline="Titular" media={media} />);
    await act(async () => {});
    expect(container.querySelector("video")?.hasAttribute("autoplay")).toBe(true);
    expect(play).toHaveBeenCalled();
    const button = await findByRole("button", { name: ui.videoPause });
    // El vídeo está «reproduciéndose»: paused es de solo lectura en jsdom, se simula.
    Object.defineProperty(container.querySelector("video"), "paused", { configurable: true, value: false });
    fireEvent.click(button);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(await findByRole("button", { name: ui.videoPlay })).toBeTruthy();
  });
});

describe("Galería", () => {
  it("renderiza las imágenes con su alt y la etiqueta IA solo en las aiGenerated", () => {
    const { getByRole } = renderView(buildFullLanding({ sections: ["gallery"], gallery }));
    const section = getByRole("region", { name: ui.sectionTitles.gallery });
    for (const image of gallery) {
      const img = within(section).getByRole("img", { name: image.alt });
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("sizes")).toBeTruthy();
    }
    expect(within(section).getAllByText(ui.aiImageLabel)).toHaveLength(1);
    const aiFigure = within(section).getByText(ui.aiImageLabel).closest("figure") as HTMLElement;
    expect(within(aiFigure).getByRole("img", { name: "Imagen de ejemplo dos" })).toBeTruthy();
  });

  it("la sección gallery sin datos no se renderiza", () => {
    const { container } = renderView(buildFullLanding({ sections: ["gallery", "faq"] }));
    expect(container.querySelector("#gallery")).toBeNull();
    expect(container.textContent).not.toContain(ui.sectionTitles.gallery);
  });

  it("el mosaico no deja huecos: la primera es grande y las últimas se ensanchan", () => {
    expect(galleryItemClasses(0, 4)).toBe("col-span-2 row-span-2");
    // 3 piezas pequeñas: la última ocupa la fila en móvil y dos columnas en escritorio.
    expect(galleryItemClasses(3, 4)).toBe("col-span-2 md:col-span-2");
    expect(galleryItemClasses(1, 5)).toBe("md:col-span-1");
    expect(galleryItemClasses(4, 5)).toBe("md:col-span-1");
  });
});

describe("Barra fija de contacto en móvil", () => {
  it("existe con el texto heroCta, enlaza a #contact y está oculta en escritorio", () => {
    const { getByTestId } = renderView();
    const bar = getByTestId("mobile-cta-bar");
    expect(bar.className).toContain("md:hidden");
    expect(bar.className).toContain("fixed");
    const link = within(bar).getByText(ui.heroCta).closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("#contact");
    // Oculta al cargar (el hero está a la vista): fuera del orden de tabulación.
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("-1");
  });

  it("aparece al dejar atrás el hero y se oculta al llegar al contacto", () => {
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { getByTestId, container } = renderView();
    const hero = container.querySelector("#hero") as Element;
    const contact = container.querySelector("#contact") as Element;
    const entry = (target: Element, isIntersecting: boolean, top: number) =>
      ({ target, isIntersecting, boundingClientRect: { top } }) as unknown as IntersectionObserverEntry;
    act(() => callback([entry(hero, false, -800), entry(contact, false, 900)], {} as IntersectionObserver));
    expect(getByTestId("mobile-cta-bar").getAttribute("aria-hidden")).toBe("false");
    act(() => callback([entry(contact, true, 200)], {} as IntersectionObserver));
    expect(getByTestId("mobile-cta-bar").getAttribute("aria-hidden")).toBe("true");
  });

  it("sin bloque de contacto no hay barra", () => {
    const { queryByTestId } = renderView(buildFullLanding({ sections: ["faq"] }));
    expect(queryByTestId("mobile-cta-bar")).toBeNull();
  });
});
