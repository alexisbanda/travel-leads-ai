/**
 * Salvaguardas de la regla 2 («no vendemos viajes») sobre el contenido
 * generado: ningún texto lleva importes con la moneda del mercado (el precio
 * solo vive en `priceGuidance`, que impone el brief) ni frases prohibidas del
 * pack de mercado (`contentGuardrails.forbiddenClaims`). Lógica pura.
 */

export interface GuardrailContext {
  /** Locale del mercado (BCP 47), para derivar el símbolo y el nombre de la moneda. */
  locale: string;
  /** Moneda del mercado (ISO 4217). */
  currency: string;
  /** Frases prohibidas del pack de mercado. */
  forbiddenClaims: readonly string[];
}

/** Campos que no son texto redactado (identificadores y enumeraciones). */
const NON_TEXT_KEYS = new Set(["slug", "segment", "tourIds", "sections", "type", "src", "kind"]);

/** Minúsculas, sin tildes ni diacríticos y con espacios simples. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Textos de la landing con su ruta (`faq.0.a`), sin identificadores ni enumeraciones. */
export function collectTexts(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path: path || "(raíz)", text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectTexts(item, path ? `${path}.${index}` : `${index}`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      NON_TEXT_KEYS.has(key) ? [] : collectTexts(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/**
 * Formas de escribir la moneda en el locale del mercado: el código ISO, el
 * símbolo, el símbolo estrecho y el nombre (p. ej. «XXX», «¤», nombre en el
 * idioma del mercado), todas derivadas con `Intl`, sin valores escritos aquí.
 */
export function currencyTokens(locale: string, currency: string): string[] {
  const tokens = new Set<string>([currency]);
  for (const currencyDisplay of ["symbol", "narrowSymbol"] as const) {
    try {
      const part = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay })
        .formatToParts(1)
        .find((p) => p.type === "currency");
      if (part !== undefined) tokens.add(part.value);
    } catch {
      // Locale o moneda no admitidos por Intl: se usa solo el código.
    }
  }
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(currency);
    if (name !== undefined) tokens.add(name);
  } catch {
    // Sin nombre de la moneda.
  }
  return [...tokens].map(normalizeText).filter((token) => token !== "");
}

/** Expresión que detecta un importe junto a la moneda (antes o después). */
function amountPattern(tokens: readonly string[]): RegExp {
  const number = String.raw`\d[\d.,\s]*`;
  const words = tokens.map((token) => {
    const escaped = escapeRegExp(token);
    // Códigos y nombres alfabéticos: palabra completa, con hasta 2 letras de plural.
    return /^\p{L}+(?: \p{L}+)*$/u.test(token)
      ? String.raw`(?<!\p{L})${escaped}\p{L}{0,2}(?!\p{L})`
      : escaped;
  });
  const currency = `(?:${words.join("|")})`;
  return new RegExp(`(?:${number}\\s*${currency}|${currency}\\s*${number})`, "u");
}

function claimPattern(claim: string): RegExp {
  return new RegExp(
    String.raw`(?<![\p{L}\p{N}])${escapeRegExp(normalizeText(claim))}(?![\p{L}\p{N}])`,
    "u",
  );
}

/**
 * Devuelve los incumplimientos (`ruta: mensaje`) de los textos de `landing`.
 * Comparación sin mayúsculas ni tildes; las frases prohibidas se buscan como
 * frase completa.
 */
export function checkGuardrails(landing: unknown, context: GuardrailContext): string[] {
  const amount = amountPattern(currencyTokens(context.locale, context.currency));
  const claims = context.forbiddenClaims.map((claim) => ({ claim, pattern: claimPattern(claim) }));
  const errors: string[] = [];
  for (const { path, text } of collectTexts(landing)) {
    const normalized = normalizeText(text);
    const found = amount.exec(normalized);
    if (found !== null) {
      errors.push(
        `${path}: contiene un importe con moneda («${found[0].trim()}»); no escribas precios en los textos: el precio orientativo solo va en priceGuidance`,
      );
    }
    for (const { claim, pattern } of claims) {
      if (pattern.test(normalized)) {
        errors.push(
          `${path}: contiene una frase prohibida por el pack de mercado («${claim}»): no se promete disponibilidad, reserva ni precio final`,
        );
      }
    }
  }
  return errors;
}
