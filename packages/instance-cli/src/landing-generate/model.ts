import Anthropic from "@anthropic-ai/sdk";
import { LANDING_MAX_TOKENS, type TokenUsage } from "./config.js";

/** Turno de la conversación con el modelo. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LandingModelInput {
  model: string;
  system: string;
  messages: ConversationTurn[];
  /** JSON Schema de la salida estructurada. */
  schema: Record<string, unknown>;
}

export interface LandingModelOutput {
  /** JSON devuelto por el modelo, sin validar todavía. */
  draft: unknown;
  usage: TokenUsage;
  /** Modelo que respondió. */
  model: string;
}

/** Cliente del modelo; los tests inyectan uno simulado. */
export interface LandingModel {
  generate(input: LandingModelInput): Promise<LandingModelOutput>;
}

/** Error del modelo que no se reintenta (credenciales, negativa, respuesta truncada…). */
export class LandingModelError extends Error {
  override name = "LandingModelError";
}

export const NO_CREDENTIALS_MESSAGE =
  "sin credenciales: exporta ANTHROPIC_API_KEY o ejecuta ant auth login";

/** Lo que usa el generador del cliente del SDK (permite simularlo en tests). */
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
    ): PromiseLike<Pick<Anthropic.Message, "content" | "stop_reason" | "usage" | "model">>;
  };
}

/**
 * Implementación con la API de Claude. Las credenciales salen del entorno del
 * operador (`ANTHROPIC_API_KEY` o el perfil de `ant auth login`); nunca se
 * pasan explícitamente. El cliente se crea en la primera llamada.
 *
 * Usa `messages.create` con `output_config.format` (JSON Schema) y valida la
 * respuesta con Zod fuera de aquí: el helper `zodOutputFormat` del SDK exige
 * esquemas de `zod/v4` y los de `@tla/shared` son de la API v3.
 */
export class AnthropicLandingModel implements LandingModel {
  private client: MessagesClient | undefined;

  /** `createClient` solo se sustituye en los tests (cliente simulado, sin red). */
  constructor(private readonly createClient: () => MessagesClient = () => new Anthropic()) {}

  async generate(input: LandingModelInput): Promise<LandingModelOutput> {
    try {
      this.client ??= this.createClient();
      const response = await this.client.messages.create({
        model: input.model,
        max_tokens: LANDING_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: input.schema } },
        system: input.system,
        messages: input.messages,
      });
      if (response.stop_reason === "refusal") {
        throw new LandingModelError(
          "el modelo se ha negado a generar el contenido (stop_reason: refusal)",
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw new LandingModelError(
          `respuesta truncada: se alcanzó el límite de ${LANDING_MAX_TOKENS} tokens (stop_reason: max_tokens)`,
        );
      }
      const text = response.content.find((block) => block.type === "text");
      if (text === undefined || text.type !== "text") {
        throw new LandingModelError("la respuesta del modelo no contiene texto");
      }
      let draft: unknown;
      try {
        draft = JSON.parse(text.text);
      } catch (error) {
        throw new LandingModelError(
          `la respuesta del modelo no es JSON válido: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {
        draft,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      throw toLandingModelError(error);
    }
  }
}

/** Traduce los errores del SDK a mensajes claros, sin exponer secretos. */
export function toLandingModelError(error: unknown): LandingModelError {
  if (error instanceof LandingModelError) return error;
  if (error instanceof Anthropic.AuthenticationError)
    return new LandingModelError(NO_CREDENTIALS_MESSAGE);
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new LandingModelError("las credenciales no tienen permiso para usar este modelo");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new LandingModelError("modelo no encontrado: revisa --model o TLA_LANDING_MODEL");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LandingModelError(
      "límite de uso de la API alcanzado: espera unos minutos y vuelve a intentarlo",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new LandingModelError(`petición rechazada por la API: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LandingModelError("no se pudo conectar con la API de Claude");
  }
  if (error instanceof Anthropic.APIError) {
    return new LandingModelError(
      `error de la API de Claude (${error.status ?? "sin estado"}): ${error.message}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/api[_ ]?key|auth|credential/i.test(message))
    return new LandingModelError(NO_CREDENTIALS_MESSAGE);
  return new LandingModelError(message);
}
