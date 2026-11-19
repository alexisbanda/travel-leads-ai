// Cliente mínimo de la Conversions API de Meta: `POST /{version}/{pixelId}/events`.
// Reutiliza la versión y la URL base de `meta-graph-api.ts`. El token va en la cabecera
// `Authorization`, nunca en la URL; los errores solo llevan el status y los códigos de
// Meta, nunca el cuerpo enviado ni la respuesta completa (pueden traer datos personales).
import type { CapiLeadEvent } from "../domain/capi-lead-event.js";
import {
  META_GRAPH_API_TIMEOUT_MS,
  META_GRAPH_API_VERSION,
  metaGraphApiBaseUrl,
} from "./meta-graph-api.js";

export type MetaCapiErrorKind = "status" | "network" | "timeout" | "invalid_response";

export interface MetaCapiErrorInfo {
  status?: number;
  /** `error.code` de Meta, si la respuesta lo trae. */
  code?: number;
  /** `error.error_subcode` de Meta, si la respuesta lo trae. */
  subcode?: number;
  /** `error.fbtrace_id` de Meta, para soporte. */
  fbtraceId?: string;
}

/**
 * Fallo de la CAPI. `detail` es apto para el evento del lead y para logs:
 * `meta_capi_<status>`, `meta_capi_network`, `meta_capi_timeout` o
 * `meta_capi_invalid_response`. `transient` marca los fallos que conviene reintentar
 * (5xx, 429, red y timeout).
 */
export class MetaCapiError extends Error {
  override name = "MetaCapiError";
  readonly detail: string;
  readonly transient: boolean;
  readonly status?: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;

  constructor(
    readonly kind: MetaCapiErrorKind,
    info: MetaCapiErrorInfo = {},
  ) {
    const detail = kind === "status" ? `meta_capi_${info.status ?? 0}` : `meta_capi_${kind}`;
    super(detail);
    this.detail = detail;
    this.transient =
      kind === "network" ||
      kind === "timeout" ||
      (kind === "status" && info.status !== undefined && isTransientStatus(info.status));
    if (info.status !== undefined) this.status = info.status;
    if (info.code !== undefined) this.code = info.code;
    if (info.subcode !== undefined) this.subcode = info.subcode;
    if (info.fbtraceId !== undefined) this.fbtraceId = info.fbtraceId;
  }
}

/** 5xx y 429 se reintentan; el resto de 4xx son definitivos. */
export function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export interface SendCapiEventsOptions {
  pixelId: string;
  /** Token de la CAPI (Secret Manager). */
  accessToken: string;
  /** Código del Administrador de eventos para pruebas en dev. Vacío o ausente: no se envía. */
  testEventCode?: string;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

const FBTRACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Solo `code`, `error_subcode` y `fbtrace_id` del error de Meta; el resto se descarta. */
function errorInfo(body: unknown): Omit<MetaCapiErrorInfo, "status"> {
  if (typeof body !== "object" || body === null) return {};
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return {};
  const { code, error_subcode: subcode, fbtrace_id: fbtraceId } = error as Record<string, unknown>;
  return {
    ...(Number.isInteger(code) && { code: code as number }),
    ...(Number.isInteger(subcode) && { subcode: subcode as number }),
    ...(typeof fbtraceId === "string" && FBTRACE_ID.test(fbtraceId) && { fbtraceId }),
  };
}

/** Envía eventos a la CAPI y devuelve `events_received`. */
export async function sendCapiEvents(
  options: SendCapiEventsOptions,
  events: readonly CapiLeadEvent[],
): Promise<number> {
  if (!/^[0-9]+$/.test(options.pixelId)) throw new Error("pixelId inválido");
  const doFetch = options.fetch ?? fetch;
  const base = metaGraphApiBaseUrl(options.env ?? process.env);
  const url = `${base}/${META_GRAPH_API_VERSION}/${options.pixelId}/events`;
  const testEventCode = options.testEventCode?.trim() ?? "";
  const body = JSON.stringify({
    data: events,
    ...(testEventCode !== "" && { test_event_code: testEventCode }),
  });

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? META_GRAPH_API_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new MetaCapiError(timedOut ? "timeout" : "network");
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    throw new MetaCapiError("status", { status: response.status, ...errorInfo(json) });
  }
  const received = (json as { events_received?: unknown } | undefined)?.events_received;
  if (typeof received !== "number" || !Number.isInteger(received)) {
    throw new MetaCapiError("invalid_response", { status: response.status });
  }
  return received;
}
