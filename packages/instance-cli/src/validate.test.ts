import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { es } from "@tla/markets";
import type { MarketPack } from "@tla/shared";
import { afterAll, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry, type PackRegistry } from "./load.js";
import { runValidate, validateInstanceDir } from "./validate.js";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = join(DEFAULT_INSTANCES_DIR, "ec-es");
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Copia `instances/ec-es` a `<tmp>/ec-es` aplicando `changes` (ruta con
 * puntos → valor) y devuelve la carpeta de la copia.
 */
function copyWith(changes: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "instance-validate-"));
  tempDirs.push(root);
  const dir = join(root, "ec-es");
  cpSync(SOURCE, dir, { recursive: true });
  const file = join(dir, "instance.yaml");
  const doc = parseDocument(readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) doc.setIn(path.split("."), value);
  writeFileSync(file, doc.toString());
  return dir;
}

function run(argv: string[], registry?: PackRegistry) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = runValidate(argv, {
    registry,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

function rulesOf(dir: string, registry?: PackRegistry): string[] {
  return validateInstanceDir(dir, registry).issues.map((issue) => `${issue.rule} ${issue.path}`);
}

/** Valores ficticios que el esquema exige fuera de draft. */
const LIVE_FIELDS = {
  "agency.legalName": "Agencia de prueba",
  "partner.legalName": "Socio de prueba",
  "channels.whatsapp.number": `+${"1".repeat(10)}`,
  "commission.rate": 0.1,
};

describe("instance:validate sobre el repositorio", () => {
  it("valida todas las instancias (criterio 1)", () => {
    expect(run([])).toEqual({
      code: 0,
      stdout: ["_template: OK (solo esquema)", "ec-es: OK"],
      stderr: [],
    });
  });

  it("valida solo la instancia indicada (criterio 1)", () => {
    expect(run(["ec-es"])).toEqual({ code: 0, stdout: ["ec-es: OK"], stderr: [] });
    expect(run(["--", "ec-es"]).stdout).toEqual(["ec-es: OK"]);
  });

  it("falla con un id inexistente o argumentos inválidos", () => {
    const missing = run(["zz-zz"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr[0]).toContain("no existe la instancia «zz-zz»");
    expect(run(["../ec-es"]).code).toBe(1);
    expect(run(["ec-es", "_template"]).code).toBe(1);
    expect(run(["--dir"]).code).toBe(1);
    expect(run(["--verbose"]).code).toBe(1);
    expect(run(["ec-es", "--dir", SOURCE]).code).toBe(1);
  });
});

describe("instance:validate --dir con packs reales", () => {
  it("acepta una copia sin cambios", () => {
    expect(run(["--dir", copyWith({})])).toMatchObject({ code: 0, stdout: ["ec-es: OK"] });
  });

  it("rechaza infra.region fuera de las regiones del mercado (criterio 2)", () => {
    const dir = copyWith({ "infra.region": "us-central1" });
    expect(rulesOf(dir)).toEqual(["data-region infra.region"]);
    const result = run(["--dir", dir]);
    expect(result.code).toBe(1);
    expect(result.stdout[0]).toBe("ec-es: 1 error");
    expect(result.stdout[1]).toMatch(/^ {2}\[data-region\] infra\.region: el mercado ES \(gdpr\)/);
  });

  it("rechaza una ubicación de BigQuery distinta de la del mercado (criterio 2)", () => {
    const dir = copyWith({ "infra.bigqueryLocation": "US" });
    expect(rulesOf(dir)).toEqual(["data-region infra.bigqueryLocation"]);
    const result = run(["--dir", dir]);
    expect(result.code).toBe(1);
    expect(result.stdout[1]).toContain("[data-region] infra.bigqueryLocation:");
  });

  it("exige scc con un destino sin decisión de adecuación (criterio 3)", () => {
    const dir = copyWith({ "compliance.internationalTransfer": "adequacy" });
    expect(rulesOf(dir)).toEqual(["international-transfer compliance.internationalTransfer"]);
    expect(run(["--dir", dir]).code).toBe(1);
  });

  it("falla si el mercado no tiene pack (criterio 4)", () => {
    const dir = copyWith({ "market.country": "XX" });
    expect(rulesOf(dir)).toEqual([
      "pack-missing market.country",
      "destination-market-missing market.country",
    ]);
    const result = run(["--dir", dir]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "  [pack-missing] market.country: no existe pack de mercado para XX (packages/markets)",
    );
  });

  it("falla si hay un agente activo y el pack no trae aviso de IA (criterio 4)", () => {
    const withoutDisclosure = { ...es, aiDisclosure: undefined } as unknown as MarketPack;
    const registry: PackRegistry = { ...defaultPackRegistry, market: () => withoutDisclosure };
    const dir = copyWith({ "agents.qualification.enabled": true });
    expect(rulesOf(dir, registry)).toEqual(["ai-disclosure agents.qualification.enabled"]);
    expect(run(["--dir", dir], registry).code).toBe(1);
  });

  it.each(["pilot", "active"])(
    "falla en %s con los textos legales del pack en draft (criterio 5)",
    (status) => {
      const dir = copyWith({ ...LIVE_FIELDS, status });
      const issues = validateInstanceDir(dir).issues;
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((issue) => issue.rule === "legal-texts-draft")).toBe(true);
      expect(issues.some((issue) => issue.message.includes("legalTexts.version"))).toBe(true);
    },
  );

  it("informa de errores de esquema con su ruta e id distinto de la carpeta", () => {
    const dir = copyWith({ "infra.region": "Not A Region" });
    expect(rulesOf(dir)).toEqual(["schema infra.region"]);
    const renamed = copyWith({ id: "ec-es-x" });
    expect(rulesOf(renamed)).toEqual(["instance-id id"]);
  });
});

describe("comando real (tsx src/validate.ts)", () => {
  const tsx = join(PACKAGE_DIR, "node_modules", ".bin", "tsx");
  const exec = (args: string[]) =>
    spawnSync(tsx, ["src/validate.ts", ...args], { cwd: PACKAGE_DIR, encoding: "utf8" });

  it("sale con 0 en el repositorio y con 1 ante una región no permitida", () => {
    const ok = exec([]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("ec-es: OK");

    const bad = exec(["--dir", copyWith({ "infra.region": "us-central1" })]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("[data-region] infra.region:");
  }, 30_000);
});
