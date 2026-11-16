import { z } from "zod";

/**
 * Validadores reutilizables para la configuración de instancias y packs.
 *
 * Ninguno contiene listas de países, monedas, zonas horarias ni regiones:
 * los formatos se comprueban con expresiones regulares y los catálogos
 * estándar (ISO 4217, IANA, BCP 47) con la API `Intl` del entorno.
 */

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("currency"));
const SUPPORTED_TIME_ZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("timeZone"));

export function isCurrencyCode(value: string): boolean {
  return SUPPORTED_CURRENCIES.has(value);
}

export function isTimeZone(value: string): boolean {
  if (SUPPORTED_TIME_ZONES.has(value)) return true;
  // Alias IANA válidos que `supportedValuesOf` no lista (p. ej. "UTC").
  // Se excluyen los desplazamientos fijos (signo + horas:minutos), que no son zonas IANA.
  if (!/^[A-Za-z]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isLocale(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

/**
 * Acepta la cadena vacía (campo pendiente de rellenar) o un valor válido
 * según `schema`, conservando los mensajes de error de `schema`.
 */
export function emptyOr(schema: z.ZodType<string, z.ZodTypeDef, unknown>) {
  return z.string().superRefine((value, ctx) => {
    if (value === "") return;
    const result = schema.safeParse(value);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message });
    }
  });
}

/** Código de país ISO 3166-1 alfa-2 en mayúsculas. Solo se valida el formato. */
export const CountryCode = z.string().regex(/^[A-Z]{2}$/, {
  message: "código ISO 3166-1 alfa-2 inválido: deben ser dos letras mayúsculas",
});

/** Código de moneda ISO 4217 reconocido por `Intl`. */
export const CurrencyCode = z.string().refine(isCurrencyCode, {
  message: "código de moneda ISO 4217 inválido",
});

/** Etiqueta de idioma BCP 47 (p. ej. idioma-REGIÓN). */
export const Locale = z.string().refine(isLocale, {
  message: "etiqueta de idioma BCP 47 inválida",
});

/** Zona horaria de la base de datos IANA. */
export const TimeZone = z.string().refine(isTimeZone, {
  message: "zona horaria IANA inválida",
});

/** Referencia a un secreto de Secret Manager: `secret:NOMBRE`. */
export const SecretRef = z.string().regex(/^secret:[A-Z0-9_]+$/, {
  message:
    "debe ser una referencia secret:NOMBRE (mayúsculas, dígitos y _); no escribas secretos en claro",
});

/** Número de teléfono en formato E.164. */
export const E164Phone = z.string().regex(/^\+[1-9][0-9]{6,14}$/, {
  message: "número de teléfono E.164 inválido (+ y entre 7 y 15 dígitos)",
});

/** Hora del día `HH:MM` en formato de 24 horas. */
export const TimeOfDay = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
  message: "hora inválida: usa HH:MM en formato de 24 horas",
});

/** Día de la semana ISO 8601: 1 = lunes … 7 = domingo. */
export const IsoWeekday = z
  .number()
  .int({ message: "día de la semana inválido: usa 1 (lunes) … 7 (domingo)" })
  .min(1, { message: "día de la semana inválido: usa 1 (lunes) … 7 (domingo)" })
  .max(7, { message: "día de la semana inválido: usa 1 (lunes) … 7 (domingo)" });

/** Mes del año: 1 = enero … 12 = diciembre. */
export const Month = z
  .number()
  .int({ message: "mes inválido: usa 1 (enero) … 12 (diciembre)" })
  .min(1, { message: "mes inválido: usa 1 (enero) … 12 (diciembre)" })
  .max(12, { message: "mes inválido: usa 1 (enero) … 12 (diciembre)" });

/** Identificador en minúsculas con guiones o guiones bajos (`adventure`, `agencia-xx`). */
export const Slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, {
  message: "identificador inválido: minúsculas, dígitos, - y _",
});

/** Región de Google Cloud (`<área>-<zona><número>`). Solo se valida el formato. */
export const GcpRegion = z.string().regex(/^[a-z]+-[a-z]+[0-9]+$/, {
  message: "región de Google Cloud inválida",
});

/** Ubicación de BigQuery: multirregión (en mayúsculas) o región de Google Cloud. */
export const BigQueryLocation = z.string().regex(/^([A-Z]{2,}|[a-z]+-[a-z]+[0-9]+)$/, {
  message: "ubicación de BigQuery inválida: multirregión en mayúsculas o región de Google Cloud",
});

/** ID de proyecto de Firebase / Google Cloud. */
export const FirebaseProjectId = z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, {
  message: "ID de proyecto de Firebase inválido (6-30 caracteres: minúsculas, dígitos y -)",
});

/** URL `https://`. */
export const HttpsUrl = z
  .string()
  .url({ message: "URL inválida" })
  .refine((value) => value.startsWith("https://"), {
    message: "la URL debe usar https://",
  });

/** Nombre de dominio sin esquema (`example.org`). */
export const DomainName = z
  .string()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    message: "dominio inválido: escribe solo el nombre, sin https:// ni rutas",
  });

/** Color hexadecimal `#RRGGBB`. */
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  message: "color inválido: usa #RRGGBB",
});

/** Versión de un texto (legal, aviso de IA): `draft` o un identificador de versión. */
export const TextVersion = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
  message: "versión inválida: usa draft o un identificador como 1.0.0 o 2026-01",
});

/** Texto obligatorio (no vacío ni solo espacios). */
export const NonEmptyText = z
  .string()
  .refine((value) => value.trim() !== "", { message: "el texto no puede estar vacío" });

/** Horario de atención: franja diaria y días de la semana. */
export const BusinessHours = z
  .object({
    start: TimeOfDay,
    end: TimeOfDay,
    days: z
      .array(IsoWeekday)
      .min(1, { message: "indica al menos un día de atención" })
      .refine((days) => new Set(days).size === days.length, {
        message: "hay días de la semana repetidos",
      }),
  })
  .strict()
  .superRefine((hours, ctx) => {
    if (hours.end <= hours.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "la hora de cierre debe ser posterior a la de apertura",
      });
    }
  });
export type BusinessHours = z.infer<typeof BusinessHours>;

/** Mecanismo de transferencia internacional de datos personales. */
export const InternationalTransfer = z.enum(["scc", "adequacy", "none"]);
export type InternationalTransfer = z.infer<typeof InternationalTransfer>;

/** Devuelve los valores repetidos de una lista. */
export function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}
