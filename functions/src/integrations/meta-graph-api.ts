// Cliente mínimo de la Graph API de Meta para leer un lead de Lead Ads
// (docs/specs/004-meta-lead-ads-ingesta.md). El token va en la cabecera
// `Authorization`, nunca en la URL; los errores llevan el status, nunca el cuerpo
// (puede traer datos personales).

/** Versión de la Graph API. Actualízala aquí cuando Meta retire la actual. */
export const META_GRAPH_API_VERSION = "v24.0";
/** URL base de la Graph API. */
export const META_GRAPH_API_DEFAULT_BASE_URL = "https://graph.facebook.com";
/**
 * Variable de entorno que sobrescribe la URL base **solo** con `FUNCTIONS_EMULATOR=true`
 * (para probar contra un *stub* local).
 */
export const META_GRAPH_API_BASE_URL_ENV = "META_GRAPH_API_BASE_URL";
/** Campos que se piden del lead. */
export const META_LEAD_FIELDS = "field_data,created_time,ad_id,adset_id,campaign_id,form_id";
/** Tiempo máximo de espera de una petición. */
export const META_GRAPH_API_TIMEOUT_MS = 10_000;

/**
 * Fallo de la Graph API. `code` es apto para logs y para el documento de `inbox`:
 * `graph_api_<status>`, `graph_api_network` o `graph_api_invalid_response`.
 */
export class MetaGraphApiError extends Error {
  override name = "MetaGraphApiError";
  readonly code: string;
  constructor(
    readonly kind: "status" | "network" | "invalid_response",
    readonly status?: number,
  ) {
    const code = kind === "status" ? `graph_api_${status ?? 0}` : `graph_api_${kind}`;
    super(code);
    this.code = code;
  }
}

/** URL base efectiva: la de Meta salvo en el emulador con la variable definida. */
export function metaGraphApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[META_GRAPH_API_BASE_URL_ENV];
  if (env.FUNCTIONS_EMULATOR === "true" && override !== undefined && override !== "") {
    return override.replace(/\/+$/, "");
  }
  return META_GRAPH_API_DEFAULT_BASE_URL;
}

export interface MetaGraphApiClientOptions {
  /** Token de página (Secret Manager). Se resuelve en cada petición. */
  accessToken(): string;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface MetaGraphApiClient {
  /** Devuelve el JSON del lead sin validar (lo valida `domain/meta-lead.ts`). */
  fetchLead(leadgenId: string): Promise<unknown>;
}

export function createMetaGraphApiClient(options: MetaGraphApiClientOptions): MetaGraphApiClient {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? META_GRAPH_API_TIMEOUT_MS;
  return {
    async fetchLead(leadgenId) {
      if (!/^[0-9]+$/.test(leadgenId)) throw new Error("leadgenId inválido");
      const base = metaGraphApiBaseUrl(options.env ?? process.env);
      const url = `${base}/${META_GRAPH_API_VERSION}/${leadgenId}?fields=${encodeURIComponent(META_LEAD_FIELDS)}`;
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${options.accessToken()}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new MetaGraphApiError("network");
      }
      if (!response.ok) {
        // Se descarta el cuerpo sin leerlo en el error: puede traer datos personales.
        await response.body?.cancel().catch(() => undefined);
        throw new MetaGraphApiError("status", response.status);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new MetaGraphApiError("invalid_response");
      }
    },
  };
}
