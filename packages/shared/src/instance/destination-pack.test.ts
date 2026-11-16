import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { DestinationPack } from "./destination-pack.js";

// Utilidades de test (duplicadas en cada archivo de test para no publicarlas en el build).
/** Primer valor de una lista de `Intl.supportedValuesOf`, para no escribir valores reales. */
function firstSupported(kind: "currency" | "timeZone"): string {
  const value = Intl.supportedValuesOf(kind)[0];
  if (value === undefined) throw new Error(`Intl no expone valores de ${kind}`);
  return value;
}

/** Copia profunda de `base` con `value` en la ruta con puntos `path`. */
function withValue<T>(base: T, path: string, value: unknown): T {
  const copy = structuredClone(base);
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) throw new Error("ruta vacía");
  let node = copy as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
  return copy;
}

/** Paths (con puntos) de todos los issues de un `safeParse`. */
function issuePaths(result: z.SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

// Pack ficticio: códigos y regiones inventados; moneda y zona horaria tomadas de Intl.
const source = { label: "Fuente oficial ficticia", url: "https://example.org/fuente" };
const validPack = {
  country: "XX",
  currency: firstSupported("currency"),
  timezone: firstSupported("timeZone"),
  regions: [
    { id: "region-a", label: "Región A" },
    { id: "region-b", label: "Región B" },
  ],
  seasons: [
    { id: "high", label: "Temporada alta", months: [6, 7, 8] },
    { id: "dry-a", label: "Seca en A", months: [1, 2], regions: ["region-a"] },
  ],
  markets: {
    YY: { entryRequirements: [source], travelAdvice: [source], adequacyDecision: false },
  },
};

describe("DestinationPack", () => {
  it("acepta un pack completo", () => {
    expect(issuePaths(DestinationPack.safeParse(validPack))).toEqual([]);
  });

  it.each([
    ["country", "xx"],
    ["timezone", "Mars/Olympus"],
    [
      "regions",
      [
        { id: "region-a", label: "Región A" },
        { id: "region-a", label: "Región A repetida" },
      ],
    ],
    ["seasons.0.months", [13]],
    ["seasons.1.regions", ["region-z"]],
    ["markets.YY.travelAdvice", []],
    ["markets.YY.entryRequirements", [{ label: "Sin https", url: "http://example.org" }]],
  ])("rechaza un %s inválido", (path, value) => {
    const result = DestinationPack.safeParse(withValue(validPack, path, value));
    expect(result.success).toBe(false);
    expect(issuePaths(result).every((issuePath) => issuePath.startsWith(path))).toBe(true);
  });

  it("rechaza un mercado cuya clave no es un código de país", () => {
    const result = DestinationPack.safeParse(
      withValue(validPack, "markets", { yy: validPack.markets.YY }),
    );
    expect(issuePaths(result)).toEqual(["markets.yy"]);
  });
});
