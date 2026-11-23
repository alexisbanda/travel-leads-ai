import { describe, expect, it } from "vitest";
import type { BusinessHours } from "@tla/shared";
import {
  businessMinutesBetween,
  SLA_LOOKBACK_DAYS,
  slaCandidateWindow,
  slaLevelsDue,
  zonedInstant,
} from "./sla.js";

// Zona con horario de verano para probar los saltos; en runtime sale de `config/sla`.
const TZ = "Europe/Madrid"; // hardcoding-ok: valor de prueba
const HOURS: BusinessHours = { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6] };
const THRESHOLDS = { warnAfterMinutes: 10, breachAfterMinutes: 30 };

/** Instante UTC; en enero la zona de prueba va a UTC+1 y en julio a UTC+2. */
const at = (iso: string) => new Date(iso);
const minutes = (from: string, to: string, hours: BusinessHours = HOURS) =>
  businessMinutesBetween(at(from), at(to), hours, TZ);

describe("zonedInstant", () => {
  it("convierte una hora de pared al instante UTC según el desfase del día", () => {
    expect(
      new Date(zonedInstant({ year: 2030, month: 1, day: 15 }, "09:00", TZ)).toISOString(),
    ).toBe("2030-01-15T08:00:00.000Z");
    expect(
      new Date(zonedInstant({ year: 2030, month: 7, day: 2 }, "09:00", TZ)).toISOString(),
    ).toBe("2030-07-02T07:00:00.000Z");
  });

  it("una hora inexistente por el salto de primavera cae tras el salto", () => {
    // 02:30 no existe el 31/03/2030: pasa a las 03:30 de verano (01:30 UTC).
    expect(
      new Date(zonedInstant({ year: 2030, month: 3, day: 31 }, "02:30", TZ)).toISOString(),
    ).toBe("2030-03-31T01:30:00.000Z");
  });
});

describe("businessMinutesBetween", () => {
  it("dentro del horario cuenta los minutos de reloj", () => {
    // Martes 15/01/2030, 10:00 → 10:11 hora local.
    expect(minutes("2030-01-15T09:00:00Z", "2030-01-15T09:11:00Z")).toBe(11);
    expect(minutes("2030-01-15T09:00:00Z", "2030-01-15T09:31:00Z")).toBe(31);
  });

  it("redondea hacia abajo los minutos incompletos", () => {
    expect(minutes("2030-01-15T09:00:00Z", "2030-01-15T09:10:59Z")).toBe(10);
  });

  it("un lead creado a las 22:10 empieza a contar a las 09:00 del día hábil siguiente", () => {
    // Martes 22:10 local → miércoles 09:10 local: 10 minutos hábiles.
    expect(minutes("2030-01-15T21:10:00Z", "2030-01-16T08:10:00Z")).toBe(10);
    expect(minutes("2030-01-15T21:10:00Z", "2030-01-16T08:09:00Z")).toBe(9);
    expect(minutes("2030-01-15T21:10:00Z", "2030-01-16T07:59:00Z")).toBe(0);
  });

  it("un lead creado antes de la apertura cuenta desde la apertura del mismo día", () => {
    expect(minutes("2030-01-15T05:00:00Z", "2030-01-15T08:30:00Z")).toBe(30);
  });

  it("poco antes del cierre se pausa al cierre y sigue en la apertura siguiente", () => {
    // Martes 20:55 local → miércoles 09:05 local: 5 + 5.
    expect(minutes("2030-01-15T19:55:00Z", "2030-01-16T08:05:00Z")).toBe(10);
  });

  it("los días no hábiles no cuentan", () => {
    // Sábado 19/01 21:30 local → lunes 21/01 09:10 local; el domingo no es hábil.
    expect(minutes("2030-01-19T20:30:00Z", "2030-01-21T08:10:00Z")).toBe(10);
  });

  it("suma varios días hábiles completos", () => {
    // Martes 09:00 → jueves 09:00 local: dos franjas de 12 h.
    expect(minutes("2030-01-15T08:00:00Z", "2030-01-17T08:00:00Z")).toBe(2 * 12 * 60);
  });

  it("usa el desfase de verano", () => {
    // Martes 02/07/2030, 09:00 → 09:30 local (UTC+2).
    expect(minutes("2030-07-02T07:00:00Z", "2030-07-02T07:30:00Z")).toBe(30);
    expect(minutes("2030-07-02T06:30:00Z", "2030-07-02T07:30:00Z")).toBe(30);
  });

  it("el salto de primavera no cuenta la hora que no existe", () => {
    const night: BusinessHours = { start: "01:00", end: "04:00", days: [1, 2, 3, 4, 5, 6, 7] };
    // 31/03/2030: 01:00 local (00:00 UTC) → 04:00 local de verano (02:00 UTC) son 2 h reales.
    expect(minutes("2030-03-31T00:00:00Z", "2030-03-31T02:00:00Z", night)).toBe(120);
  });

  it("el retraso de otoño cuenta dos veces la hora repetida, porque son instantes distintos", () => {
    const night: BusinessHours = { start: "01:00", end: "04:00", days: [1, 2, 3, 4, 5, 6, 7] };
    // 27/10/2030: 01:00 local de verano (23:00 UTC del 26) → 04:00 local de invierno (03:00 UTC).
    expect(minutes("2030-10-26T23:00:00Z", "2030-10-27T03:00:00Z", night)).toBe(240);
  });

  it("devuelve 0 si `to` no es posterior a `from`", () => {
    expect(minutes("2030-01-15T09:00:00Z", "2030-01-15T09:00:00Z")).toBe(0);
    expect(minutes("2030-01-15T09:30:00Z", "2030-01-15T09:00:00Z")).toBe(0);
  });
});

describe("slaLevelsDue", () => {
  it("sin umbral alcanzado no hay niveles", () => {
    expect(slaLevelsDue(9, THRESHOLDS)).toEqual([]);
  });

  it("al alcanzar el umbral de aviso, warning", () => {
    expect(slaLevelsDue(10, THRESHOLDS)).toEqual(["warning"]);
    expect(slaLevelsDue(11, THRESHOLDS)).toEqual(["warning"]);
  });

  it("con los dos umbrales y sin marcas, primero warning y luego breach", () => {
    expect(slaLevelsDue(31, THRESHOLDS)).toEqual(["warning", "breach"]);
  });

  it("cada nivel solo una vez: su marca lo cierra", () => {
    const now = new Date();
    expect(slaLevelsDue(11, THRESHOLDS, { warnedAt: now })).toEqual([]);
    expect(slaLevelsDue(31, THRESHOLDS, { warnedAt: now })).toEqual(["breach"]);
    expect(slaLevelsDue(31, THRESHOLDS, { warnedAt: now, breachedAt: now })).toEqual([]);
  });

  it("con primera respuesta no hay niveles", () => {
    expect(slaLevelsDue(100, THRESHOLDS, { firstResponseAt: new Date() })).toEqual([]);
  });
});

describe("slaCandidateWindow", () => {
  it("va de hace SLA_LOOKBACK_DAYS días a hace warnAfterMinutes", () => {
    const now = at("2030-01-15T12:00:00Z");
    const { createdFrom, createdTo } = slaCandidateWindow(now, 10);
    expect(createdTo.toISOString()).toBe("2030-01-15T11:50:00.000Z");
    expect(now.getTime() - createdFrom.getTime()).toBe(SLA_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  });
});
