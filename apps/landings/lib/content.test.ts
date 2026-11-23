import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLandings } from "./content.js";
import { buildLanding, mkLandingsDir, writeLandingFile } from "./test-fixtures.js";

describe("loadLandings", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve [] si no existe la carpeta de contenido", () => {
    const dir = mkLandingsDir();
    tempDirs.push(dirname(dirname(dir)));
    expect(loadLandings("ec-es", { dir, includeDrafts: false })).toEqual([]);
  });

  it("filtra las landings draft cuando includeDrafts es false", () => {
    const dir = mkLandingsDir();
    tempDirs.push(dirname(dirname(dir)));
    writeLandingFile(dir, "publicada", buildLanding({ slug: "publicada" }));
    writeLandingFile(dir, "borrador", buildLanding({ slug: "borrador", draft: true }));
    const landings = loadLandings("ec-es", { dir, includeDrafts: false });
    expect(landings.map((l) => l.slug)).toEqual(["publicada"]);
  });

  it("incluye las landings draft cuando includeDrafts es true", () => {
    const dir = mkLandingsDir();
    tempDirs.push(dirname(dirname(dir)));
    writeLandingFile(dir, "publicada", buildLanding({ slug: "publicada" }));
    writeLandingFile(dir, "borrador", buildLanding({ slug: "borrador", draft: true }));
    const landings = loadLandings("ec-es", { dir, includeDrafts: true });
    expect(landings.map((l) => l.slug).sort()).toEqual(["borrador", "publicada"]);
  });

  it("falla con un mensaje claro si el contenido no es un LandingContent válido", () => {
    const dir = mkLandingsDir();
    tempDirs.push(dirname(dirname(dir)));
    const { title: _title, ...seoWithoutTitle } = buildLanding().seo;
    writeLandingFile(dir, "roto", { ...buildLanding({ slug: "roto" }), seo: seoWithoutTitle });
    expect(() => loadLandings("ec-es", { dir, includeDrafts: false })).toThrowError(
      /seo\.title/,
    );
  });

  it("falla con un mensaje claro si el JSON es inválido", () => {
    const dir = mkLandingsDir();
    tempDirs.push(dirname(dirname(dir)));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "roto.json"), "{ not json");
    expect(() => loadLandings("ec-es", { dir, includeDrafts: false })).toThrow();
  });
});
