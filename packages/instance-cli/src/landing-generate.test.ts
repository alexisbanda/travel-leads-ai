import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LandingContent, ResolvedInstanceConfig } from "@tla/shared";
import { resolveInstanceById } from "./cli.js";
import { runLandingGenerate, type LandingGenerateOptions } from "./landing-generate.js";
import { LANDING_MODEL_ENV } from "./landing-generate/config.js";
import type { LandingModel, LandingModelInput } from "./landing-generate/model.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry } from "./load.js";

// Tests con un cliente del modelo SIMULADO: ninguno llama a la API real ni
// necesita ANTHROPIC_API_KEY. Usan la instancia de ejemplo en solo lectura y
// escriben la landing en un directorio temporal (`landingsDir`). Datos
// ficticios: nunca datos de leads.

const INSTANCE = "ec-es";
const resolved = resolveInstanceById(INSTANCE, DEFAULT_INSTANCES_DIR, defaultPackRegistry);
if (!resolved.ok) throw new Error(`la instancia ${INSTANCE} no se resuelve`);
const config: ResolvedInstanceConfig = resolved.config;
const SEGMENT = config.segments[0]?.id ?? "";
const OTHER_SEGMENT = config.segments[1]?.id ?? "otro";
const LEGAL_SLUG = config.marketPack.legalTexts.pages[0]?.slug ?? "";
const FORBIDDEN = config.marketPack.contentGuardrails?.forbiddenClaims[0] ?? "";
/** Importe formateado en la moneda del mercado de la instancia (p. ej. «890 ¤»). */
const AMOUNT = new Intl.NumberFormat(config.market.locale, {
  style: "currency",
  currency: config.market.currency,
  maximumFractionDigits: 0,
}).format(890);

let tmp: string;
let landingsDir: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tla-landing-generate-"));
  landingsDir = join(tmp, "landings");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

interface BriefFields {
  segment?: string;
  tourIds?: string[];
  days?: number;
  priceFrom?: number;
  ctaType?: string;
  campaignCode?: string;
  [key: string]: unknown;
}

function writeBrief(
  fields: BriefFields = {},
  body = "Ruta ficticia con alojamiento y guía local.",
): string {
  const merged: BriefFields = {
    segment: SEGMENT,
    tourIds: ["tour-ficticio-3d"],
    days: 3,
    ctaType: "whatsapp",
    ...fields,
  };
  const yaml = Object.entries(merged)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const file = join(tmp, "brief.md");
  writeFileSync(file, `---\n${yaml}\n---\n\n${body}\n`);
  return file;
}

function validDraft(days = 3): Record<string, unknown> {
  return {
    seo: { title: "Ruta ficticia de prueba", description: "Descripción ficticia de la ruta." },
    hero: { headline: "Titular ficticio", subheadline: "Subtítulo ficticio" },
    highlights: [`${days} días`, "Guía local"],
    sections: ["itinerary", "includes", "bestSeason", "faq", "trust", "cta"],
    itinerary: Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      title: `Etapa ficticia ${index + 1}`,
      description: "Descripción ficticia de la etapa.",
    })),
    includes: { included: ["Alojamiento ficticio"], notIncluded: ["Vuelos"] },
    bestSeason: { summary: "Época ficticia." },
    faq: [{ q: "¿Cómo reservo?", a: "Escríbenos y te preparamos una propuesta orientativa." }],
    cta: { prefill: "Hola, me interesa la ruta ficticia" },
  };
}

interface FakeModel extends LandingModel {
  calls: LandingModelInput[];
}

/** Modelo simulado: devuelve las respuestas en orden (la última se repite). */
function fakeModel(responses: unknown[], model = "claude-opus-5-5"): FakeModel {
  const calls: LandingModelInput[] = [];
  return {
    calls,
    async generate(input) {
      calls.push(structuredClone(input));
      const draft = responses[Math.min(calls.length - 1, responses.length - 1)];
      return {
        draft: structuredClone(draft),
        usage: { inputTokens: 1000, outputTokens: 500 },
        model,
      };
    },
  };
}

async function run(
  argv: string[],
  model: LandingModel,
  extra: Partial<LandingGenerateOptions> = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runLandingGenerate(
    {
      argv,
      landingsDir,
      cwd: tmp,
      env: {},
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      ...extra,
    },
    { model },
  );
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function readLanding(slug: string): LandingContent {
  return JSON.parse(readFileSync(join(landingsDir, `${slug}.json`), "utf8")) as LandingContent;
}

describe("instance:landing:generate · precio (regla 2)", () => {
  it("con priceFrom: priceGuidance.from es exactamente el del brief y la sección se incluye", async () => {
    const model = fakeModel([{ ...validDraft(), priceGuidance: { from: 1 } }]);
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ priceFrom: 890 })],
      model,
    );
    expect(result.code).toBe(0);
    const landing = readLanding("ruta-ficticia");
    expect(landing.priceGuidance).toEqual({ from: 890 });
    expect(landing.sections).toContain("priceGuidance");
  });

  it("sin priceFrom: no hay priceGuidance aunque el modelo lo proponga", async () => {
    const draft: Record<string, unknown> = { ...validDraft(), priceGuidance: { from: 500 } };
    draft.sections = ["itinerary", "priceGuidance", "gallery", "faq", "cta"];
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief()],
      fakeModel([draft]),
    );
    expect(result.code).toBe(0);
    const landing = readLanding("ruta-ficticia");
    expect(landing.priceGuidance).toBeUndefined();
    expect(landing.sections).toEqual(["itinerary", "faq", "cta"]);
  });

  it("el prompt no recibe el importe del brief", async () => {
    const model = fakeModel([validDraft()]);
    await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief({ priceFrom: 890 })], model);
    const prompt = JSON.stringify(model.calls[0]);
    expect(prompt).not.toContain("890");
  });

  it.each([
    [
      "un importe con la moneda del mercado",
      (d: Record<string, unknown>) => ({
        ...d,
        seo: { title: "Ruta", description: `Desde ${AMOUNT} por persona` },
      }),
    ],
    [
      "una frase prohibida del pack de mercado",
      (d: Record<string, unknown>) => ({
        ...d,
        faq: [{ q: "¿Está confirmada?", a: `Sí, ${FORBIDDEN} al momento.` }],
      }),
    ],
  ])("rechaza un texto con %s y no escribe nada", async (_label, mutate) => {
    const model = fakeModel([mutate(validDraft())]);
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ priceFrom: 890 })],
      model,
    );
    expect(result.code).toBe(1);
    expect(model.calls).toHaveLength(2);
    expect(existsSync(join(landingsDir, "ruta-ficticia.json"))).toBe(false);
    expect(result.err).toMatch(/importe con moneda|frase prohibida/);
  });
});

describe("instance:landing:generate · campos impuestos por el brief", () => {
  it("ignora slug, draft, tourIds, segment, cta.type y medios del modelo", async () => {
    const draft = {
      ...validDraft(),
      slug: "otro-slug",
      draft: false,
      tourIds: ["tour-del-modelo"],
      segment: OTHER_SEGMENT,
      hero: {
        headline: "Titular ficticio",
        media: { src: "/media/x.jpg", kind: "image", alt: "x" },
      },
      gallery: [],
      experiment: { id: "exp", variant: "a" },
      cta: { type: "form", prefill: "Hola, me interesa [CAMP-1] la ruta ficticia" },
    };
    const brief = writeBrief({ tourIds: ["tour-a", "tour-b"], campaignCode: "CAMP-1" });
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", brief], fakeModel([draft]));
    expect(result.code).toBe(0);
    const landing = readLanding("ruta-ficticia");
    expect(landing.slug).toBe("ruta-ficticia");
    expect(landing.draft).toBe(true);
    expect(landing.tourIds).toEqual(["tour-a", "tour-b"]);
    expect(landing.segment).toBe(SEGMENT);
    expect(landing.cta.type).toBe("whatsapp");
    expect(landing.cta.prefill).toBe("Hola, me interesa la ruta ficticia [CAMP-1]");
    expect(landing.hero.media).toBeUndefined();
    expect(landing.gallery).toBeUndefined();
    expect(landing.experiment).toBeUndefined();
  });

  it("añade [campaignCode] al final del prefill si el modelo no lo puso", async () => {
    const brief = writeBrief({ campaignCode: "CAMP-2" });
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", brief],
      fakeModel([validDraft()]),
    );
    expect(result.code).toBe(0);
    expect(readLanding("ruta-ficticia").cta.prefill).toBe(
      "Hola, me interesa la ruta ficticia [CAMP-2]",
    );
  });

  it("con ctaType form impone cta.type form y descarta el prefill del modelo", async () => {
    const brief = writeBrief({ ctaType: "form" });
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", brief],
      fakeModel([validDraft()]),
    );
    expect(result.code).toBe(0);
    expect(readLanding("ruta-ficticia").cta).toEqual({ type: "form" });
  });

  it("escribe JSON con 2 espacios y salto de línea final", async () => {
    await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], fakeModel([validDraft()]));
    const raw = readFileSync(join(landingsDir, "ruta-ficticia.json"), "utf8");
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw.startsWith('{\n  "slug": "ruta-ficticia"')).toBe(true);
  });
});

describe("instance:landing:generate · validación y un único reintento", () => {
  it("si la primera respuesta es inválida, reintenta una vez con los errores y escribe", async () => {
    const invalid = { ...validDraft(), itinerary: validDraft(2).itinerary };
    const model = fakeModel([invalid, validDraft()]);
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], model);
    expect(result.code).toBe(0);
    expect(model.calls).toHaveLength(2);
    const retry = model.calls[1]?.messages ?? [];
    expect(retry.map((turn) => turn.role)).toEqual(["user", "assistant", "user"]);
    expect(retry[2]?.content).toContain("itinerary");
    expect(result.out).toContain("2 llamadas");
  });

  it("si falla dos veces: 2 llamadas, no escribe nada, muestra errores y sale con 1", async () => {
    const model = fakeModel([{ ...validDraft(), seo: { title: "" } }]);
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], model);
    expect(result.code).not.toBe(0);
    expect(model.calls).toHaveLength(2);
    expect(existsSync(join(landingsDir, "ruta-ficticia.json"))).toBe(false);
    expect(result.err).toContain("seo.");
    expect(result.err).toContain("no se ha escrito nada");
  });

  it("si el modelo falla (p. ej. sin credenciales) no escribe nada y sale con 1", async () => {
    const model: LandingModel = {
      generate: () =>
        Promise.reject(
          new Error("sin credenciales: exporta ANTHROPIC_API_KEY o ejecuta ant auth login"),
        ),
    };
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], model);
    expect(result.code).toBe(1);
    expect(result.err).toContain("sin credenciales");
    expect(existsSync(join(landingsDir, "ruta-ficticia.json"))).toBe(false);
  });
});

describe("instance:landing:generate · fallos antes de llamar al modelo y --force", () => {
  it.each([
    [
      "instancia inexistente",
      () => ["no-existe", "ruta-ficticia", "--brief", writeBrief()],
      /no existe la instancia/,
    ],
    ["plantilla", () => ["_template", "ruta-ficticia", "--brief", writeBrief()], /plantilla/],
    ["slug inválido", () => [INSTANCE, "Mal_Slug", "--brief", writeBrief()], /slug inválido/],
    ["slug de página legal", () => [INSTANCE, LEGAL_SLUG, "--brief", writeBrief()], /página legal/],
    [
      "--from inexistente",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief(), "--from", "no-existe"],
      /--from/,
    ],
    [
      "brief inexistente",
      () => [INSTANCE, "ruta-ficticia", "--brief", join(tmp, "nada.md")],
      /no se puede leer el brief/,
    ],
    [
      "brief sin tourIds",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ tourIds: [] })],
      /tourIds/,
    ],
    [
      "brief con campo desconocido",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ pricefrom: 1 })],
      /pricefrom|Unrecognized/,
    ],
    [
      "brief con days no entero",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ days: 2.5 })],
      /days/,
    ],
    [
      "brief con priceFrom no positivo",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ priceFrom: 0 })],
      /priceFrom/,
    ],
    [
      "brief sin hechos",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({}, "   ")],
      /hechos del producto/,
    ],
    [
      "segmento fuera de la instancia",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief({ segment: "no-existe" })],
      /segments/,
    ],
    ["sin --brief", () => [INSTANCE, "ruta-ficticia"], /--brief/],
    [
      "opción desconocida",
      () => [INSTANCE, "ruta-ficticia", "--brief", writeBrief(), "--nope"],
      /opción desconocida/,
    ],
  ])("%s: sale con 1 sin llamar al modelo", async (_label, argv, message) => {
    const model = fakeModel([validDraft()]);
    const result = await run(argv(), model);
    expect(result.code).toBe(1);
    expect(model.calls).toHaveLength(0);
    expect(result.err).toMatch(message);
  });

  it("no sobrescribe un archivo existente sin --force", async () => {
    const brief = writeBrief();
    await run([INSTANCE, "ruta-ficticia", "--brief", brief], fakeModel([validDraft()]));
    const file = join(landingsDir, "ruta-ficticia.json");
    writeFileSync(file, "contenido previo\n");
    const model = fakeModel([validDraft()]);
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", brief], model);
    expect(result.code).toBe(1);
    expect(model.calls).toHaveLength(0);
    expect(result.err).toContain("--force");
    expect(readFileSync(file, "utf8")).toBe("contenido previo\n");
  });

  it("con --force sobrescribe", async () => {
    const file = join(landingsDir, "ruta-ficticia.json");
    await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], fakeModel([validDraft()]));
    writeFileSync(file, "contenido previo\n");
    const model = fakeModel([validDraft()]);
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief(), "--force"],
      model,
    );
    expect(result.code).toBe(0);
    expect(model.calls).toHaveLength(1);
    expect(readLanding("ruta-ficticia").slug).toBe("ruta-ficticia");
  });
});

describe("instance:landing:generate · prompt, modelo, medios, tokens y coste", () => {
  it("lista los medios que faltan y muestra tokens y coste estimado en USD", async () => {
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief()],
      fakeModel([validDraft()]),
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain("draft: true");
    expect(result.out).toContain("hero.media");
    expect(result.out).toContain("gallery: de 3 a 12 imágenes");
    expect(result.out).toContain("content/media");
    expect(result.out).toContain("Tokens: 1000 de entrada y 500 de salida (1 llamada");
    // 1000 × 4 / 1M + 500 × 20 / 1M = 0,014 USD
    expect(result.out).toContain("Coste estimado: 0.0140 USD");
  });

  it("suma los tokens del reintento", async () => {
    const model = fakeModel([{ ...validDraft(), hero: {} }, validDraft()]);
    const result = await run([INSTANCE, "ruta-ficticia", "--brief", writeBrief()], model);
    expect(result.out).toContain("Tokens: 2000 de entrada y 1000 de salida (2 llamadas");
    expect(result.out).toContain("Coste estimado: 0.0280 USD");
  });

  it("modelo desconocido: coste no disponible", async () => {
    const model = fakeModel([validDraft()], "modelo-ficticio");
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief(), "--model", "modelo-ficticio"],
      model,
    );
    expect(model.calls[0]?.model).toBe("modelo-ficticio");
    expect(result.out).toContain("coste no disponible");
  });

  it("usa TLA_LANDING_MODEL si no hay --model, y el de por defecto si no hay ninguno", async () => {
    const withEnv = fakeModel([validDraft()]);
    await run([INSTANCE, "ruta-a", "--brief", writeBrief()], withEnv, {
      env: { [LANDING_MODEL_ENV]: "modelo-env" },
    });
    expect(withEnv.calls[0]?.model).toBe("modelo-env");
    const byDefault = fakeModel([validDraft()]);
    await run([INSTANCE, "ruta-b", "--brief", writeBrief()], byDefault);
    expect(byDefault.calls[0]?.model).toBe("claude-opus-5-5");
  });

  it("el prompt usa locale y agentTone del pack y el brief va en el mensaje de usuario", async () => {
    const model = fakeModel([validDraft()]);
    await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief({}, "Hecho ficticio único 42.")],
      model,
    );
    const call = model.calls[0];
    expect(call?.system).toContain(config.market.locale);
    expect(call?.system).toContain(config.marketPack.agentTone);
    expect(call?.system).toContain("exactly 3 entries");
    expect(call?.messages[0]?.content).toContain("Hecho ficticio único 42.");
    expect(call?.schema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("--from incluye la landing base como ejemplo de estilo, sin medios ni precio", async () => {
    const base = JSON.parse(
      readFileSync(
        join(DEFAULT_INSTANCES_DIR, INSTANCE, "content/landings/galapagos-y-andes.json"),
        "utf8",
      ),
    ) as LandingContent;
    const model = fakeModel([validDraft()]);
    const result = await run(
      [INSTANCE, "ruta-ficticia", "--brief", writeBrief(), "--from", "galapagos-y-andes"],
      model,
    );
    expect(result.code).toBe(0);
    const system = model.calls[0]?.system ?? "";
    expect(system).toContain(base.hero.headline);
    expect(system).not.toContain("/media/");
    expect(system).not.toContain('priceGuidance": {');
    expect(system).not.toContain("gallery");
  });
});
