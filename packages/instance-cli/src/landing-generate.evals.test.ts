import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveInstanceById } from "./cli.js";
import {
  BRIEFS_DIR,
  checkLanguage,
  evaluateLanding,
  hasClaudeCredentials,
  SKIPPED_MESSAGE,
} from "./landing-generate.evals.js";
import { parseBrief, type LandingBrief } from "./landing-generate/brief.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry } from "./load.js";

// Prueba la lógica de las evals sin llamar a la API: ningún test necesita credenciales.

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const resolved = resolveInstanceById("ec-es", DEFAULT_INSTANCES_DIR, defaultPackRegistry);
if (!resolved.ok) throw new Error("ec-es no se resuelve");
const config = resolved.config;

const SPANISH =
  "Recorre el valle con un guía local y descubre las aves del río durante la mañana, con tiempo para descansar en el albergue.";
const ENGLISH =
  "Walk the valley with a local guide and discover the birds of the river in the morning, with time to rest at the lodge.";

const brief: LandingBrief = {
  segment: "adventure",
  tourIds: ["tour-eval"],
  days: 1,
  priceFrom: 100,
  ctaType: "form",
  facts: "Hechos ficticios.",
};

function landing(text: string, extra: Record<string, unknown> = {}) {
  return {
    slug: "eval-x",
    segment: "adventure",
    tourIds: ["tour-eval"],
    seo: { title: text, description: text },
    hero: { headline: text },
    sections: ["itinerary", "priceGuidance", "cta"],
    itinerary: [{ day: 1, title: text, description: text }],
    priceGuidance: { from: 100 },
    cta: { type: "form" },
    draft: true,
    ...extra,
  };
}

describe("evals del generador de landings", () => {
  it("los briefs de evals son válidos y sus segmentos existen en la instancia", () => {
    const files = readdirSync(BRIEFS_DIR).filter((file) => file.endsWith(".md"));
    expect(files).toHaveLength(3);
    const segments = config.segments.map((segment) => segment.id);
    const parsed = files.map((file) => parseBrief(readFileSync(join(BRIEFS_DIR, file), "utf8")));
    for (const result of parsed) {
      expect(result.ok).toBe(true);
      if (result.ok) expect(segments).toContain(result.brief.segment);
    }
    const briefs = parsed.flatMap((result) => (result.ok ? [result.brief] : []));
    expect(
      briefs.some(
        (b) =>
          b.priceFrom !== undefined && b.ctaType === "whatsapp" && b.campaignCode !== undefined,
      ),
    ).toBe(true);
    expect(briefs.some((b) => b.priceFrom === undefined && b.ctaType === "form")).toBe(true);
  });

  it("checkLanguage acepta el idioma del locale y rechaza otro", () => {
    expect(checkLanguage(landing(SPANISH), "es-ES")).toEqual([]);
    expect(checkLanguage(landing(ENGLISH), "es-ES").length).toBeGreaterThan(0);
    expect(checkLanguage(landing(ENGLISH), "en-GB")).toEqual([]);
    expect(checkLanguage(landing(SPANISH), "xx-YY")[0]).toMatch(/no hay palabras vacías/);
  });

  it("evaluateLanding pasa con una landing correcta y detecta precio, draft y frases prohibidas", () => {
    expect(evaluateLanding(landing(SPANISH), "eval-x", brief, config)).toEqual([]);
    const claim = config.marketPack.contentGuardrails?.forbiddenClaims[0] ?? "";
    const bad = landing(`${SPANISH} ${claim}`, { priceGuidance: { from: 99 }, draft: false });
    const failures = evaluateLanding(bad, "eval-x", brief, config).join("\n");
    expect(failures).toContain("precio:");
    expect(failures).toContain("draft:");
    expect(failures).toContain("frase prohibida");
    const noPrice = { ...brief, priceFrom: undefined };
    expect(evaluateLanding(landing(SPANISH), "eval-x", noPrice, config).join("\n")).toContain(
      "sin priceFrom",
    );
  });

  it("detecta credenciales por entorno o perfil sin depender del equipo", async () => {
    const none = () => Promise.resolve(null);
    expect(await hasClaudeCredentials({ ANTHROPIC_API_KEY: "x" }, none)).toBe(true);
    expect(await hasClaudeCredentials({}, none)).toBe(false);
    expect(await hasClaudeCredentials({}, () => Promise.resolve({}))).toBe(true);
    expect(
      await hasClaudeCredentials({}, () => Promise.reject(new Error("perfil inexistente"))),
    ).toBe(false);
  });

  it("sin credenciales, `evals` imprime skipped y sale con 0", () => {
    const configDir = mkdtempSync(join(tmpdir(), "tla-no-anthropic-"));
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("ANTHROPIC_")),
      );
      const result = spawnSync(
        join(PACKAGE_DIR, "node_modules", ".bin", "tsx"),
        ["src/landing-generate.evals.ts"],
        {
          cwd: PACKAGE_DIR,
          encoding: "utf8",
          env: { ...env, ANTHROPIC_CONFIG_DIR: configDir },
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(SKIPPED_MESSAGE);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});
