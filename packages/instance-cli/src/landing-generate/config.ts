/**
 * Configuración del generador de landings (`instance:landing:generate`).
 * Herramienta del operador: corre en su máquina, con datos del producto y
 * nunca con datos de leads.
 */

/** Modelo de Claude por defecto. Se sobrescribe con `--model` o `TLA_LANDING_MODEL`. */
export const DEFAULT_LANDING_MODEL = "claude-opus-5-5";

/** Variable de entorno que cambia el modelo por defecto. */
export const LANDING_MODEL_ENV = "TLA_LANDING_MODEL";

/** Límite de tokens de salida de cada llamada (incluye el razonamiento adaptativo). */
export const LANDING_MAX_TOKENS = 16000;

/** Precio en USD por millón de tokens, por modelo. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Tabla de precios para el coste estimado. Un modelo ausente no tiene coste estimado. */
export const MODEL_PRICES_USD: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
};

/** Tokens consumidos por una o varias llamadas al modelo. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Modelo a usar: `--model`, luego `TLA_LANDING_MODEL` y, si no, el de por defecto. */
export function resolveLandingModel(
  flag: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const fromEnv = env[LANDING_MODEL_ENV]?.trim();
  if (flag !== undefined && flag.trim() !== "") return flag.trim();
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return DEFAULT_LANDING_MODEL;
}

/** Coste estimado en USD, o `undefined` si el modelo no está en la tabla. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | undefined {
  const price = MODEL_PRICES_USD[model];
  if (price === undefined) return undefined;
  return (
    (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000
  );
}
