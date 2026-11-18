import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { getMarketPack } from "@tla/markets";
import { BRAND_PLACEHOLDER, ResolvedInstanceConfig } from "@tla/shared";
import { afterAll, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { DEFAULT_OUT_FILE, runBuild } from "./build.js";
import { REPO_ROOT } from "./cli.js";
import { DEFAULT_INSTANCES_DIR, loadInstance } from "./load.js";

const SOURCE = join(DEFAULT_INSTANCES_DIR, "ec-es");
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "instance-build-"));
  tempDirs.push(dir);
  return dir;
}

/** Copia `instances/ec-es` a `<tmp>/ec-es` con `changes` y devuelve la carpeta de instancias. */
function instancesWith(changes: Record<string, unknown>): string {
  const root = tempDir();
  const dir = join(root, "ec-es");
  cpSync(SOURCE, dir, { recursive: true });
  const file = join(dir, "instance.yaml");
  const doc = parseDocument(readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) doc.setIn(path.split("."), value);
  writeFileSync(file, doc.toString());
  return root;
}

function run(argv: string[], instancesDir?: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = runBuild(argv, {
    instancesDir,
    cwd: REPO_ROOT,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("instance:build", () => {
  it("escribe por defecto en generated/instance.json de la raíz", () => {
    expect(DEFAULT_OUT_FILE).toBe(join(REPO_ROOT, "generated", "instance.json"));
  });

  it("ec-es genera una configuración válida con la instancia por encima de los packs", () => {
    const out = join(tempDir(), "nested", "instance.json");
    const { code, stdout } = run(["ec-es", "--out", out]);
    expect(code).toBe(0);
    expect(stdout).toEqual([`ec-es: configuración resuelta en ${relative(REPO_ROOT, out)}`]);
    const config = ResolvedInstanceConfig.parse(readJson(out));
    const pack = getMarketPack("ES");
    const loaded = loadInstance(SOURCE);
    if (pack === undefined || !loaded.ok) throw new Error("falta ec-es o su pack");
    expect(config.market.timezone).toBe(pack.timezone);
    expect(config.market.locale).toBe(pack.locale);
    expect(config.market.currency).toBe(pack.currency);
    expect(config.market.businessHours).toEqual(loaded.config.market.businessHours);
    expect(config.marketPack.aiDisclosure.text).not.toContain(BRAND_PLACEHOLDER);
    expect(Object.keys(config.destinationPack.markets)).toEqual(["ES"]);
  });

  it("refleja un override de la instancia", () => {
    const instancesDir = instancesWith({ "market.businessHours.end": "19:30" });
    const out = join(tempDir(), "instance.json");
    expect(run(["ec-es", "--out", out], instancesDir).code).toBe(0);
    expect(ResolvedInstanceConfig.parse(readJson(out)).market.businessHours.end).toBe("19:30");
  });

  it("falla sin escribir si la instancia incumple una regla", () => {
    const instancesDir = instancesWith({ "infra.bigqueryLocation": "US" });
    const out = join(tempDir(), "instance.json");
    const { code, stderr } = run(["ec-es", "--out", out], instancesDir);
    expect(code).toBe(1);
    expect(stderr[0]).toBe("ec-es: 1 error");
    expect(stderr[1]).toMatch(/^ {2}\[data-region\] infra\.bigqueryLocation: /);
    expect(existsSync(out)).toBe(false);
  });

  it("es determinista: dos builds son idénticos byte a byte", () => {
    const dir = tempDir();
    const first = join(dir, "a.json");
    const second = join(dir, "b.json");
    expect(run(["ec-es", "--out", first]).code).toBe(0);
    expect(run(["ec-es", "--out", second]).code).toBe(0);
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(hash(first)).toBe(hash(second));
    const text = readFileSync(first, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toMatch(/^\{\n {2}"agency": \{/);
  });

  it("rechaza plantillas, ids inexistentes y argumentos inválidos", () => {
    expect(run(["_template"]).stderr[0]).toMatch(/plantilla/);
    expect(run(["_template"]).code).toBe(1);
    expect(run(["zz-yy"]).stderr[0]).toMatch(/no existe la instancia «zz-yy»/);
    expect(run(["../ec-es"]).code).toBe(1);
    expect(run([]).code).toBe(1);
    expect(run(["ec-es", "--out"]).code).toBe(1);
    expect(run(["ec-es", "--force"]).code).toBe(1);
  });
});
