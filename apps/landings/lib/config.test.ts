import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLandingsConfig } from "./config.js";
import { withResolvedInstance, writeResolvedInstanceFile } from "./test-fixtures.js";

describe("loadLandingsConfig", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("falla con un mensaje claro si no existe generated/instance.json", () => {
    expect(() =>
      loadLandingsConfig({ resolvedPath: "/no/existe/generated/instance.json" }),
    ).toThrowError(/pnpm instance:build/);
  });

  it("falla si INSTANCE no coincide con la instancia resuelta", () => {
    const { dir, path } = writeResolvedInstanceFile(withResolvedInstance(() => {}));
    tempDirs.push(dir);
    expect(() =>
      loadLandingsConfig({ resolvedPath: path, instanceEnv: "otra-instancia" }),
    ).toThrowError(/INSTANCE=otra-instancia no coincide/);
  });

  it("falla fuera de draft listando los campos obligatorios ausentes", () => {
    const instance = withResolvedInstance((clone) => {
      clone.brand.displayName = "";
      clone.brand.domain = "";
    });
    const { dir, path } = writeResolvedInstanceFile(instance);
    tempDirs.push(dir);
    expect(() => loadLandingsConfig({ resolvedPath: path })).toThrowError(
      /brand\.displayName, brand\.domain/,
    );
  });

  it("no lanza en draft, avisa por consola y marca isDraft", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const instance = withResolvedInstance((clone) => {
      clone.status = "draft";
      clone.brand.displayName = "";
      clone.brand.domain = "";
      clone.channels.whatsapp.number = "";
    });
    const { dir, path } = writeResolvedInstanceFile(instance);
    tempDirs.push(dir);
    const result = loadLandingsConfig({ resolvedPath: path });
    expect(result.isDraft).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
