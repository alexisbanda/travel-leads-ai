import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkMedia } from "./media.js";

/** Carpeta `content/media` temporal con los archivos dados (nombres, sin ruta). */
function mediaDirWith(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "landings-media-"));
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(join(dir, file), "contenido de ejemplo");
  return dir;
}

describe("checkMedia", () => {
  it("un archivo existente se mantiene disponible", () => {
    const mediaDir = mediaDirWith(["ejemplo.jpg"]);
    const available = checkMedia([{ ref: "/media/ejemplo.jpg", context: "landing ejemplo" }], {
      mediaDir,
      isDraft: false,
    });
    expect(available.has("/media/ejemplo.jpg")).toBe(true);
  });

  it("una URL absoluta https:// se deja pasar sin comprobar el archivo", () => {
    const mediaDir = mediaDirWith([]);
    const available = checkMedia([{ ref: "https://ejemplo.test/foto.jpg", context: "brand.logo" }], {
      mediaDir,
      isDraft: false,
    });
    expect(available.has("https://ejemplo.test/foto.jpg")).toBe(true);
  });

  it("fuera de draft, un archivo que falta lanza un error que nombra el archivo y el contexto", () => {
    const mediaDir = mediaDirWith([]);
    expect(() =>
      checkMedia([{ ref: "/media/falta.jpg", context: "landing ejemplo (hero.media.src)" }], {
        mediaDir,
        isDraft: false,
      }),
    ).toThrow(/falta\.jpg.*landing ejemplo \(hero\.media\.src\)/s);
  });

  it("en draft, un archivo que falta avisa y se descarta del resultado", () => {
    const mediaDir = mediaDirWith([]);
    const warn = vi.fn();
    const available = checkMedia([{ ref: "/media/falta.jpg", context: "landing ejemplo" }], {
      mediaDir,
      isDraft: true,
      warn,
    });
    expect(available.has("/media/falta.jpg")).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("falta.jpg");
  });

  it("rechaza una ruta con '..' aunque la instancia esté en draft", () => {
    const mediaDir = mediaDirWith([]);
    expect(() =>
      checkMedia([{ ref: "/media/../secreto.jpg", context: "landing ejemplo" }], {
        mediaDir,
        isDraft: true,
        warn: vi.fn(),
      }),
    ).toThrow(/\.\./);
  });

  it("rechaza una ruta que no empieza por /media/", () => {
    const mediaDir = mediaDirWith([]);
    expect(() =>
      checkMedia([{ ref: "/otra/ejemplo.jpg", context: "landing ejemplo" }], { mediaDir, isDraft: false }),
    ).toThrow(/\/media\//);
  });
});
