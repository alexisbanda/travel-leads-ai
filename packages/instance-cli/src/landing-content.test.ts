import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readLandingFiles, validateLandingFiles } from "./landing-content.js";

// Contenido ficticio: nada de datos reales de viajeros.
const validLanding = {
  slug: "ejemplo",
  segment: "adventure",
  tourIds: ["tour-ejemplo"],
  seo: { title: "Título de ejemplo", description: "Descripción de ejemplo." },
  hero: { headline: "Titular de ejemplo" },
  sections: ["faq", "cta"],
  cta: { type: "whatsapp" },
};

describe("validateLandingFiles", () => {
  it("acepta un contenido válido cuyo slug coincide con el archivo", () => {
    const issues = validateLandingFiles(
      [{ file: "content/landings/ejemplo.json", json: validLanding }],
      [],
    );
    expect(issues).toEqual([]);
  });

  it("falla con seo.title ausente y lo reporta con la ruta del archivo y del campo", () => {
    const { title: _title, ...seoWithoutTitle } = validLanding.seo;
    const json = { ...validLanding, seo: seoWithoutTitle };
    const issues = validateLandingFiles([{ file: "content/landings/ejemplo.json", json }], []);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe("content/landings/ejemplo.json: seo.title");
  });

  it("falla si el slug no coincide con el nombre del archivo", () => {
    const issues = validateLandingFiles(
      [{ file: "content/landings/otro.json", json: validLanding }],
      [],
    );
    expect(issues).toEqual([
      {
        path: "content/landings/otro.json: slug",
        message: expect.stringContaining("no coincide con el nombre del archivo"),
      },
    ]);
  });

  it("falla si el slug colisiona con una página legal", () => {
    const issues = validateLandingFiles(
      [{ file: "content/landings/ejemplo.json", json: validLanding }],
      ["ejemplo"],
    );
    expect(issues).toEqual([
      {
        path: "content/landings/ejemplo.json: slug",
        message: expect.stringContaining("colisiona con el slug de una página legal"),
      },
    ]);
  });

  it("reporta un JSON ilegible", () => {
    const issues = validateLandingFiles(
      [{ file: "content/landings/roto.json", error: "JSON inválido: ..." }],
      [],
    );
    expect(issues).toEqual([
      { path: "content/landings/roto.json: (raíz)", message: "JSON inválido: ..." },
    ]);
  });
});

describe("readLandingFiles", () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve [] si no existe la carpeta content/landings", () => {
    const dir = mkdtempSync(join(tmpdir(), "instance-cli-landing-"));
    tempDirs.push(dir);
    expect(readLandingFiles(dir)).toEqual([]);
  });

  it("lee los JSON de content/landings", () => {
    const dir = mkdtempSync(join(tmpdir(), "instance-cli-landing-"));
    tempDirs.push(dir);
    const landingsDir = join(dir, "content", "landings");
    mkdirSync(landingsDir, { recursive: true });
    writeFileSync(join(landingsDir, "ejemplo.json"), JSON.stringify(validLanding));
    const files = readLandingFiles(dir);
    expect(files).toEqual([
      { file: "content/landings/ejemplo.json", json: validLanding },
    ]);
  });

  it("reporta un JSON ilegible en vez de lanzar", () => {
    const dir = mkdtempSync(join(tmpdir(), "instance-cli-landing-"));
    tempDirs.push(dir);
    const landingsDir = join(dir, "content", "landings");
    mkdirSync(landingsDir, { recursive: true });
    writeFileSync(join(landingsDir, "roto.json"), "{ not json");
    const files = readLandingFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ file: "content/landings/roto.json" });
    expect("error" in (files[0] as object)).toBe(true);
  });
});
