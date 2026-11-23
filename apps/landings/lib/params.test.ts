import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildLandingParams, buildLegalParams, dynamicParams } from "./params.js";
import {
  buildLanding,
  mkLandingsDir,
  withResolvedInstance,
  writeLandingFile,
  writeResolvedInstanceFile,
} from "./test-fixtures.js";

describe("dynamicParams", () => {
  it("es false: solo existen los slugs de generateStaticParams", () => {
    expect(dynamicParams).toBe(false);
  });
});

describe("buildLandingParams", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve un slug por landing publicada (filtra draft fuera de draft)", () => {
    const { dir: configDir, path } = writeResolvedInstanceFile(withResolvedInstance(() => {}));
    tempDirs.push(configDir);
    const landingsDir = mkLandingsDir();
    tempDirs.push(dirname(dirname(landingsDir)));
    writeLandingFile(landingsDir, "ejemplo", buildLanding({ slug: "ejemplo" }));
    writeLandingFile(landingsDir, "borrador", buildLanding({ slug: "borrador", draft: true }));

    const params = buildLandingParams({ config: { resolvedPath: path }, landingsDir });
    expect(params).toEqual([{ slug: "ejemplo" }]);
  });
});

describe("buildLegalParams", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve un slug por página legal del pack de mercado", () => {
    const { dir: configDir, path } = writeResolvedInstanceFile(withResolvedInstance(() => {}));
    tempDirs.push(configDir);

    const params = buildLegalParams({ config: { resolvedPath: path } });
    expect(params).toEqual([
      { slug: "privacidad" },
      { slug: "cookies" },
      { slug: "aviso-legal" },
    ]);
  });
});
