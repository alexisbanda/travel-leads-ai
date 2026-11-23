// SLA de primera respuesta (spec 005, ticket #18). Lógica pura: minutos hábiles en la
// zona horaria del mercado y niveles de aviso pendientes. Sin Firebase ni SDKs; las
// zonas horarias se resuelven con `Intl`, así que los cambios de horario de verano
// salen de la base de datos de zonas del runtime.
import type { BusinessHours, SlaLevel } from "@tla/shared";

const MINUTE_MS = 60_000;

interface LocalDate {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
}

/** Locale técnico de `formatToParts`: solo se leen partes numéricas, no es texto para nadie. */
const PARTS_LOCALE = "en-US"; // hardcoding-ok: locale técnico, no del mercado

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(PARTS_LOCALE, {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Fecha y hora de pared de un instante en `timeZone`. */
function wallClock(instant: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** Desfase de `timeZone` respecto a UTC en `instant`, en milisegundos. */
function offsetMs(instant: number, timeZone: string): number {
  const wall = wallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - (instant - (instant % 1000));
}

/**
 * Instante de una hora de pared (`HH:MM`) de una fecha local en `timeZone`. Si la hora
 * no existe (salto de horario de verano), devuelve la equivalente tras el salto.
 */
export function zonedInstant(date: LocalDate, time: string, timeZone: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una fecha local. */
function isoWeekday(date: LocalDate): number {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Minutos (enteros, por defecto) transcurridos entre `from` y `to` que caen dentro de
 * `hours` en `timeZone`. Fuera de horario no cuenta: un lead creado de noche empieza a
 * contar en la apertura siguiente y uno creado poco antes del cierre se pausa al cierre.
 */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  hours: BusinessHours,
  timeZone: string,
): number {
  const start = from.getTime();
  const end = to.getTime();
  if (!(end > start)) return 0;

  const days = new Set<number>(hours.days);
  const last = wallClock(end, timeZone);
  const lastDate: LocalDate = { year: last.year, month: last.month, day: last.day };
  const first = wallClock(start, timeZone);
  // Un día antes por si la franja de ayer aún cubre `from` en zonas con desfase raro.
  let date = addDays({ year: first.year, month: first.month, day: first.day }, -1);

  let totalMs = 0;
  for (;;) {
    if (days.has(isoWeekday(date))) {
      const open = zonedInstant(date, hours.start, timeZone);
      const close = zonedInstant(date, hours.end, timeZone);
      const overlap = Math.min(end, close) - Math.max(start, open);
      if (overlap > 0) totalMs += overlap;
    }
    if (sameDate(date, lastDate)) break;
    date = addDays(date, 1);
  }
  return Math.floor(totalMs / MINUTE_MS);
}

/** Umbrales del SLA (`config/sla`). */
export interface SlaThresholds {
  warnAfterMinutes: number;
  breachAfterMinutes: number;
}

/** Marcas del SLA ya presentes en el lead. */
export interface SlaMarks {
  firstResponseAt?: Date | undefined;
  warnedAt?: Date | undefined;
  breachedAt?: Date | undefined;
}

/**
 * Niveles pendientes, en orden (`warning` antes que `breach`). Sin niveles si el lead
 * ya tiene primera respuesta; cada nivel solo una vez (su marca lo cierra).
 */
export function slaLevelsDue(
  businessMinutes: number,
  thresholds: SlaThresholds,
  marks: SlaMarks = {},
): SlaLevel[] {
  if (marks.firstResponseAt !== undefined) return [];
  const due: SlaLevel[] = [];
  if (businessMinutes >= thresholds.warnAfterMinutes && marks.warnedAt === undefined) {
    due.push("warning");
  }
  if (businessMinutes >= thresholds.breachAfterMinutes && marks.breachedAt === undefined) {
    due.push("breach");
  }
  return due;
}

/** Días hacia atrás que mira `slaWatchdog`: con un día hábil por semana basta. */
export const SLA_LOOKBACK_DAYS = 14;
/** Candidatos por página de la consulta, los más antiguos primero. */
export const SLA_PAGE_SIZE = 200;
/**
 * Candidatos como máximo por ejecución. Los leads ya avisados siguen en `new` hasta que
 * alguien responde, así que se pagina: un tope fijo bloquearía a los más recientes.
 */
export const SLA_MAX_CANDIDATES_PER_RUN = 1000;

/** Ventana de `createdAt` de los candidatos: los minutos hábiles nunca superan a los de reloj. */
export function slaCandidateWindow(
  now: Date,
  warnAfterMinutes: number,
): { createdFrom: Date; createdTo: Date } {
  return {
    createdFrom: new Date(now.getTime() - SLA_LOOKBACK_DAYS * 24 * 60 * MINUTE_MS),
    createdTo: new Date(now.getTime() - warnAfterMinutes * MINUTE_MS),
  };
}
