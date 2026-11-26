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
