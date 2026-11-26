import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BASE_RESOLVED_INSTANCE, buildFullLanding, withResolvedInstance } from "./test-fixtures.js";
import { buildFooterView, buildHeaderView, buildLandingView } from "./view.js";

function mediaDirWith(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "landings-view-media-"));
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(join(dir, file), "contenido de ejemplo");
  return dir;
}

describe("buildHeaderView", () => {
  it("con brand.logo, lo expone junto al nombre de marca", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "/media/logo.png";
    });
    expect(buildHeaderView(instance)).toEqual({ logo: "/media/logo.png", name: "Marca de ejemplo" });
  });

  it("sin brand.logo, solo expone el nombre de marca", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "";
    });
    expect(buildHeaderView(instance)).toEqual({ name: "Marca de ejemplo" });
  });

  it("en draft con displayName y logo vacíos, usa el nombre de la instancia (no lanza)", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "";
      c.brand.displayName = "";
      c.name = "Instancia de ejemplo";
      c.status = "draft";
    });
    expect(() => buildHeaderView(instance)).not.toThrow();
    expect(buildHeaderView(instance)).toEqual({ name: "Instancia de ejemplo" });
  });

  it("con comprobación de medios y logo inexistente en draft, cae al texto", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "/media/logo.png";
      c.status = "draft";
    });
    const mediaDir = mediaDirWith([]);
    const warn = vi.fn();
    expect(buildHeaderView(instance, { media: { mediaDir, isDraft: true, warn } })).toEqual({
      name: "Marca de ejemplo",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("con comprobación de medios y logo existente, lo mantiene", () => {
    const instance = withResolvedInstance((c) => {
      c.brand.logo = "/media/logo.png";
    });
    const mediaDir = mediaDirWith(["logo.png"]);
    expect(buildHeaderView(instance, { media: { mediaDir, isDraft: false } })).toEqual({
      logo: "/media/logo.png",
      name: "Marca de ejemplo",
    });
  });
});

describe("buildFooterView", () => {
  it("un enlace por página legal, con la razón social de agencia y socio", () => {
    const view = buildFooterView(BASE_RESOLVED_INSTANCE);
    expect(view.links).toEqual([
      { slug: "privacidad", title: "Política de privacidad" },
      { slug: "cookies", title: "Política de cookies" },
      { slug: "aviso-legal", title: "Aviso legal" },
    ]);
    expect(view.legalNames).toEqual(["Socio de ejemplo", "Agencia de ejemplo"]);
  });

  it("sin razón social de agencia ni socio, no hay nombres", () => {
    const instance = withResolvedInstance((c) => {
      c.agency.legalName = "";
      c.partner.legalName = "";
    });
    expect(buildFooterView(instance).legalNames).toEqual([]);
  });

  it("agencia y socio con la misma razón social no se duplican", () => {
    const instance = withResolvedInstance((c) => {
      c.agency.legalName = "Razón social de ejemplo";
      c.partner.legalName = "Razón social de ejemplo";
    });
    expect(buildFooterView(instance).legalNames).toEqual(["Razón social de ejemplo"]);
  });
});

describe("buildLandingView: medios del hero", () => {
  it("sin comprobación de medios (uso por defecto en tests), mantiene el media tal cual", () => {
    const view = buildLandingView(buildFullLanding(), BASE_RESOLVED_INSTANCE);
    expect(view.hero.media?.src).toBe("/media/ejemplo.mp4");
  });

  it("con media.src existente, lo mantiene", () => {
    const mediaDir = mediaDirWith(["ejemplo.mp4", "ejemplo.jpg"]);
    const view = buildLandingView(buildFullLanding(), BASE_RESOLVED_INSTANCE, {
      media: { mediaDir, isDraft: false },
    });
    expect(view.hero.media?.src).toBe("/media/ejemplo.mp4");
    expect(view.hero.media?.poster).toBe("/media/ejemplo.jpg");
  });

  it("fuera de draft, con media.src inexistente, lanza", () => {
    const mediaDir = mediaDirWith([]);
    expect(() =>
      buildLandingView(buildFullLanding(), BASE_RESOLVED_INSTANCE, { media: { mediaDir, isDraft: false } }),
    ).toThrow(/ejemplo\.mp4/);
  });

  it("en draft, con media.src inexistente, avisa y se publica sin media", () => {
    const mediaDir = mediaDirWith([]);
    const warn = vi.fn();
    const view = buildLandingView(buildFullLanding(), BASE_RESOLVED_INSTANCE, {
      media: { mediaDir, isDraft: true, warn },
    });
    expect(view.hero.media).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("buildLandingView: highlights, CTA del hero y galería", () => {
  const gallery = [
    { src: "/media/g1.jpg", kind: "image" as const, alt: "Imagen de ejemplo uno", aiGenerated: false },
    { src: "/media/g2.jpg", kind: "image" as const, alt: "Imagen de ejemplo dos", aiGenerated: true },
    { src: "/media/g3.jpg", kind: "image" as const, alt: "Imagen de ejemplo tres", aiGenerated: false },
  ];
  const ui = BASE_RESOLVED_INSTANCE.marketPack.landingUi;

  it("expone highlights y el CTA del hero hacia #contact cuando hay bloque de contacto", () => {
    const view = buildLandingView(buildFullLanding({ highlights: ["Uno", "Dos"] }), BASE_RESOLVED_INSTANCE);
    expect(view.hero.highlights).toEqual(["Uno", "Dos"]);
    expect(view.hero.cta).toEqual({ label: ui.heroCta, href: "#contact" });
    expect(view.hero.media?.controls).toEqual({ play: ui.videoPlay, pause: ui.videoPause });
  });

  it("traduce hero.media.focus a object-position", () => {
    const landing = buildFullLanding();
    landing.hero.media = { src: "/media/i.jpg", kind: "image", alt: "Alt de ejemplo", aiGenerated: false, focus: { x: 74, y: 45 } };
    expect(buildLandingView(landing, BASE_RESOLVED_INSTANCE).hero.media?.objectPosition).toBe("74% 45%");
  });

  it("sin bloque de contacto no hay CTA del hero", () => {
    const view = buildLandingView(buildFullLanding({ sections: ["faq"] }), BASE_RESOLVED_INSTANCE);
    expect(view.hero.cta).toBeUndefined();
    expect(view.hero.highlights).toBeUndefined();
  });

  it("construye la galería con alt y etiqueta IA solo en las imágenes aiGenerated", () => {
    const view = buildLandingView(buildFullLanding({ sections: ["gallery"], gallery }), BASE_RESOLVED_INSTANCE);
    expect(view.sections).toEqual([
      {
        kind: "gallery",
        title: ui.sectionTitles.gallery,
        images: [
          { src: "/media/g1.jpg", alt: "Imagen de ejemplo uno" },
          { src: "/media/g2.jpg", alt: "Imagen de ejemplo dos", aiLabel: ui.aiImageLabel },
          { src: "/media/g3.jpg", alt: "Imagen de ejemplo tres" },
        ],
      },
    ]);
  });

  it("la sección gallery sin datos no se renderiza", () => {
    const view = buildLandingView(buildFullLanding({ sections: ["gallery", "faq"] }), BASE_RESOLVED_INSTANCE);
    expect(view.sections.map((section) => section.kind)).toEqual(["faq"]);
  });

  it("fuera de draft, una imagen de galería inexistente lanza nombrando el archivo", () => {
    const mediaDir = mediaDirWith(["ejemplo.mp4", "ejemplo.jpg", "g1.jpg", "g3.jpg"]);
    expect(() =>
      buildLandingView(buildFullLanding({ sections: ["gallery"], gallery }), BASE_RESOLVED_INSTANCE, {
        media: { mediaDir, isDraft: false },
      }),
    ).toThrow(/\/media\/g2\.jpg.*gallery\[1\]/);
  });

  it("en draft, una imagen de galería inexistente se avisa y se descarta", () => {
    const mediaDir = mediaDirWith(["ejemplo.mp4", "ejemplo.jpg", "g1.jpg", "g3.jpg"]);
    const warn = vi.fn();
    const view = buildLandingView(buildFullLanding({ sections: ["gallery"], gallery }), BASE_RESOLVED_INSTANCE, {
      media: { mediaDir, isDraft: true, warn },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("gallery[1]");
    const section = view.sections[0];
    expect(section?.kind === "gallery" ? section.images.map((image) => image.src) : []).toEqual([
      "/media/g1.jpg",
      "/media/g3.jpg",
    ]);
  });

  it("no comprueba la galería si la sección no está en sections", () => {
    const mediaDir = mediaDirWith(["ejemplo.mp4", "ejemplo.jpg"]);
    expect(() =>
      buildLandingView(buildFullLanding({ gallery }), BASE_RESOLVED_INSTANCE, { media: { mediaDir, isDraft: false } }),
    ).not.toThrow();
  });
});
