// Lógica pura del webhook de Meta Lead Ads (docs/03-registro-de-leads.md):
// verificación de la firma `X-Hub-Signature-256` y extracción de los
// `leadgen_id` de una entrega. Solo usa módulos `node:*`.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";
const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Comprueba la cabecera `X-Hub-Signature-256: sha256=<hex>` contra el HMAC-SHA256
 * del cuerpo crudo con el secreto de la app. Nunca lanza: cualquier cabecera
 * ausente, mal formada o de otra longitud devuelve `false`.
 */
export function isValidMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith(SIGNATURE_PREFIX)) return false;
  const receivedHex = trimmed.slice(SIGNATURE_PREFIX.length);
  if (!HEX_SHA256.test(receivedHex)) return false;

  const received = Buffer.from(receivedHex, "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * Compara el `hub.verify_token` recibido con el configurado en tiempo constante
 * (se comparan los SHA-256 para igualar longitudes). Un token esperado vacío
 * nunca coincide.
 */
export function matchesVerifyToken(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || expected.length === 0) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Un cambio `leadgen` de la entrega: su `leadgen_id` y el `value` completo. */
export interface MetaLeadgenChange {
  leadgenId: string;
  value: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recorre `entry[].changes[]` y devuelve los cambios con `field === "leadgen"`
 * que traen un `leadgen_id` (string o número). Una entrega puede traer varios.
 * Ignora en silencio cualquier forma inesperada.
 */
export function extractLeadgenChanges(payload: unknown): MetaLeadgenChange[] {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
  const result: MetaLeadgenChange[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "leadgen" || !isRecord(change.value)) continue;
      const raw = change.value.leadgen_id;
      const leadgenId =
        typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
      if (leadgenId.length === 0) continue;
      result.push({ leadgenId, value: change.value });
    }
  }
  return result;
}

/** Los `leadgen_id` de una entrega de Meta, en orden de aparición. */
export function extractLeadgenIds(payload: unknown): string[] {
  return extractLeadgenChanges(payload).map((change) => change.leadgenId);
}
