import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { parseBrief } from "./brief.js";
import { estimateCostUsd, resolveLandingModel } from "./config.js";
import { landingDraftJsonSchema, withCampaignCode } from "./draft.js";
import { checkGuardrails, currencyTokens, normalizeText } from "./guardrails.js";
import {
  AnthropicLandingModel,
  NO_CREDENTIALS_MESSAGE,
  toLandingModelError,
  type MessagesClient,
} from "./model.js";

// Datos ficticios. La moneda sale de Intl (primera admitida) para no escribir valores reales.
const CURRENCY = Intl.supportedValuesOf("currency")[0] ?? "";
const LOCALE = "en";

describe("parseBrief", () => {
  const ok = `---\nsegment: seg\ntourIds: [t1]\ndays: 2\npriceFrom: 100\nctaType: whatsapp\ncampaignCode: C-1\n---\nHechos ficticios.\n`;

  it("acepta front matter válido y cuerpo con hechos", () => {
    const result = parseBrief(ok);
    expect(result.ok && result.brief).toMatchObject({
      days: 2,
      priceFrom: 100,
      facts: "Hechos ficticios.",
    });
  });

  it.each([
    ["sin front matter", "Solo texto"],
    ["YAML inválido", "---\nsegment: [\n---\nx"],
    ["ctaType desconocido", ok.replace("whatsapp", "email")],
    ["campaignCode con corchetes", ok.replace("C-1", "[C-1]")],
    ["days negativo", ok.replace("days: 2", "days: -1")],
  ])("rechaza %s", (_label, source) => {
    expect(parseBrief(source).ok).toBe(false);
  });
});

describe("withCampaignCode", () => {
  it.each([
    [undefined, "[C]"],
    ["Hola", "Hola [C]"],
    ["Hola [C]", "Hola [C]"],
    ["Hola [C] y [C] más", "Hola y más [C]"],
  ])("%j → %j", (prefill, expected) => {
    expect(withCampaignCode(prefill, "C")).toBe(expected);
  });
});

describe("landingDraftJsonSchema", () => {
  it("solo pide cta.prefill con ctaType whatsapp y no expone campos impuestos", () => {
    const whatsapp = landingDraftJsonSchema("whatsapp") as { properties: Record<string, unknown> };
    const form = landingDraftJsonSchema("form") as { properties: Record<string, unknown> };
    expect(Object.keys(whatsapp.properties)).toContain("cta");
    expect(Object.keys(form.properties)).not.toContain("cta");
    for (const key of [
      "slug",
      "draft",
      "tourIds",
      "segment",
      "priceGuidance",
      "gallery",
      "experiment",
    ]) {
      expect(Object.keys(whatsapp.properties)).not.toContain(key);
    }
    expect(JSON.stringify(whatsapp)).not.toContain("media");
  });
});

describe("guardrails", () => {
  const context = { locale: LOCALE, currency: CURRENCY, forbiddenClaims: ["Reserva Confirmada"] };

  it("normaliza mayúsculas y tildes", () => {
    expect(normalizeText("  ÁrBOL  Ñandú ")).toBe("arbol nandu");
  });

  it("deriva el código y el símbolo de la moneda con Intl", () => {
    expect(currencyTokens(LOCALE, CURRENCY)).toContain(CURRENCY.toLowerCase());
  });

  it.each([[`desde 890 ${CURRENCY}`], [`${CURRENCY} 1.200`], [`${CURRENCY.toLowerCase()}890`]])(
    "detecta un importe con moneda: %s",
    (text) => {
      expect(checkGuardrails({ faq: [{ q: "x", a: text }] }, context)).toHaveLength(1);
    },
  );

  it("detecta frases prohibidas sin mayúsculas ni tildes, como frase completa", () => {
    expect(checkGuardrails({ seo: { title: "Tu réserva confirmadá hoy" } }, context)[0]).toMatch(
      /^seo\.title: .*frase prohibida/,
    );
    expect(checkGuardrails({ seo: { title: "Sin reservas confirmadas" } }, context)).toEqual([]);
  });

  it("no marca palabras que solo empiezan como el código de la moneda", () => {
    const code = CURRENCY.toLowerCase();
    expect(checkGuardrails({ faq: [{ q: "x", a: `${code}xyz 15 días` }] }, context)).toEqual([]);
  });

  it("no marca números sin moneda ni campos que no son texto", () => {
    expect(
      checkGuardrails({ highlights: ["4 días", "2.500 m"], slug: `x-890-${CURRENCY}` }, context),
    ).toEqual([]);
  });
});

describe("config", () => {
  it("resuelve el modelo: --model > TLA_LANDING_MODEL > por defecto", () => {
    expect(resolveLandingModel("a", { TLA_LANDING_MODEL: "b" })).toBe("a");
    expect(resolveLandingModel(undefined, { TLA_LANDING_MODEL: "b" })).toBe("b");
    expect(resolveLandingModel(undefined, {})).toBe("claude-opus-5-5");
  });

  it("estima el coste por modelo", () => {
    expect(
      estimateCostUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.6);
    expect(estimateCostUsd("desconocido", { inputTokens: 1, outputTokens: 1 })).toBeUndefined();
  });
});

describe("AnthropicLandingModel (cliente simulado, sin red)", () => {
  function clientReturning(response: Partial<Anthropic.Message>): {
    client: MessagesClient;
    bodies: unknown[];
  } {
    const bodies: unknown[] = [];
    const client: MessagesClient = {
      messages: {
        create: async (body) => {
          bodies.push(body);
          return {
            content: [],
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 20 } as Anthropic.Usage,
            model: "claude-opus-5-5",
            ...response,
          };
        },
      },
    };
    return { client, bodies };
  }
  const input = {
    model: "claude-opus-5-5",
    system: "s",
    messages: [{ role: "user" as const, content: "u" }],
    schema: {},
  };

  it("pide salida estructurada con pensamiento adaptativo y devuelve el JSON y los tokens", async () => {
    const { client, bodies } = clientReturning({
      content: [{ type: "text", text: '{"a":1}', citations: null }],
    });
    const output = await new AnthropicLandingModel(() => client).generate(input);
    expect(output).toEqual({
      draft: { a: 1 },
      usage: { inputTokens: 10, outputTokens: 20 },
      model: "claude-opus-5-5",
    });
    expect(bodies[0]).toMatchObject({
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: {} } },
    });
    expect(bodies[0]).not.toHaveProperty("temperature");
  });

  it.each([
    ["refusal", /refusal/],
    ["max_tokens", /max_tokens/],
  ] as const)("convierte stop_reason %s en un error claro", async (stopReason, message) => {
    const { client } = clientReturning({ stop_reason: stopReason });
    await expect(new AnthropicLandingModel(() => client).generate(input)).rejects.toThrow(message);
  });

  it("traduce AuthenticationError a un mensaje sin credenciales", () => {
    const error = new Anthropic.AuthenticationError(
      401,
      undefined,
      "invalid x-api-key",
      new Headers(),
    );
    expect(toLandingModelError(error).message).toBe(NO_CREDENTIALS_MESSAGE);
  });
});
