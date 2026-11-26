import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInstanceId, syncMedia } from "./sync-media.mjs";

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), "landings-repo-"));
}

describe("resolveInstanceId", () => {
  it("usa INSTANCE si está en el entorno", () => {
    expect(resolveInstanceId({ INSTANCE: "ec-es" }, "/no-existe")).toBe("ec-es");
  });

  it("sin INSTANCE, lee el id de generated/instance.json", () => {
    const repoRoot = mkRepo();
    mkdirSync(join(repoRoot, "generated"), { recursive: true });
    writeFileSync(join(repoRoot, "generated", "instance.json"), JSON.stringify({ id: "ec-es" }));
    expect(resolveInstanceId({}, repoRoot)).toBe("ec-es");
  });

  it("sin INSTANCE ni generated/instance.json, no hay id", () => {
    const repoRoot = mkRepo();
    expect(resolveInstanceId({}, repoRoot)).toBeUndefined();
  });
});

describe("syncMedia", () => {
  it("copia instances/<id>/content/media al directorio destino, borrando antes el destino", () => {
    const repoRoot = mkRepo();
    const mediaDir = join(repoRoot, "instances", "ec-es", "content", "media");
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, "ejemplo.jpg"), "contenido de ejemplo");

    const targetDir = mkdtempSync(join(tmpdir(), "landings-public-media-"));
    writeFileSync(join(targetDir, "restos-de-antes.txt"), "restos");

    syncMedia({ instanceId: "ec-es", repoRoot, targetDir });

    expect(existsSync(join(targetDir, "ejemplo.jpg"))).toBe(true);
    expect(readFileSync(join(targetDir, "ejemplo.jpg"), "utf8")).toBe("contenido de ejemplo");
    expect(existsSync(join(targetDir, "restos-de-antes.txt"))).toBe(false);
  });

  it("sin carpeta de medios en la instancia, deja el destino vacío y no falla", () => {
    const repoRoot = mkRepo();
    const targetDir = mkdtempSync(join(tmpdir(), "landings-public-media-"));
    expect(() => syncMedia({ instanceId: "ec-es", repoRoot, targetDir })).not.toThrow();
    expect(existsSync(targetDir)).toBe(true);
  });

  it("sin instanceId, deja el destino vacío y no falla", () => {
    const repoRoot = mkRepo();
    const targetDir = mkdtempSync(join(tmpdir(), "landings-public-media-"));
    expect(() => syncMedia({ instanceId: undefined, repoRoot, targetDir })).not.toThrow();
    expect(existsSync(targetDir)).toBe(true);
  });
});
