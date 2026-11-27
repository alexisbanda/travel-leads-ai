import { LandingCtaType } from "@tla/shared";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const Text = z.string().trim().min(1, { message: "no puede estar vacío" });

/**
 * Front matter del brief de una landing. Estricto: un campo desconocido es
 * un error (evita erratas como `pricefrom`). Se valida antes de llamar al
 * modelo.
 */
export const LandingBriefFrontMatter = z
  .object({
    /** Segmento de viajero; debe existir en `segments` de la instancia. */
    segment: Text,
    /** Tours del catálogo que ilustra la landing. */
    tourIds: z.array(Text).min(1, { message: "indica al menos un tour" }),
    /** Duración del viaje: el itinerario tendrá exactamente estos días. */
    days: z
      .number()
      .int({ message: "days debe ser un entero" })
      .min(1, { message: "days empieza en 1" }),
    /** Precio orientativo «desde», por persona, en la moneda del mercado. */
    priceFrom: z.number().positive({ message: "priceFrom debe ser positivo" }).optional(),
    ctaType: LandingCtaType,
    /** Código de campaña: el mensaje predefinido de WhatsApp termina en `[código]`. */
    campaignCode: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/, { message: "usa letras, dígitos, - o _" })
      .optional(),
  })
  .strict();
export type LandingBriefFrontMatter = z.infer<typeof LandingBriefFrontMatter>;

/** Brief validado: front matter y hechos del producto (cuerpo en Markdown). */
export interface LandingBrief extends LandingBriefFrontMatter {
  facts: string;
}

export type ParseBriefResult = { ok: true; brief: LandingBrief } | { ok: false; errors: string[] };

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

/**
 * Parsea un brief en Markdown con front matter YAML entre líneas `---`.
 * Lógica pura: recibe el texto ya leído.
 */
export function parseBrief(source: string): ParseBriefResult {
  const match = FRONT_MATTER.exec(source);
  if (match === null) {
    return {
      ok: false,
      errors: ["falta el front matter: el brief debe empezar con un bloque YAML entre líneas ---"],
    };
  }
  const [, yamlText = "", body = ""] = match;
  let data: unknown;
  try {
    data = parseYaml(yamlText);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `front matter YAML inválido: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const errors: string[] = [];
  const result = LandingBriefFrontMatter.safeParse(data ?? {});
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.length > 0 ? issue.path.join(".") : "(front matter)";
      errors.push(`${field}: ${issue.message}`);
    }
  }
  const facts = body.trim();
  if (facts === "")
    errors.push("(cuerpo): describe los hechos del producto debajo del front matter");
  if (!result.success || errors.length > 0) return { ok: false, errors };
  return { ok: true, brief: { ...result.data, facts } };
}
