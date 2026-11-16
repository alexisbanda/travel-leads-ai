import { describe, expect, it } from "vitest";
import { DestinationPack } from "@tla/shared";
import { destinationPacks, getDestinationPack } from "../index.js";
import { ec } from "./pack.js";

describe("pack de destino ec", () => {
  it("valida contra el esquema DestinationPack", () => {
    expect(DestinationPack.safeParse(ec).success).toBe(true);
  });

  it("define moneda local y zona horaria de la agencia", () => {
    expect(ec.country).toBe("EC");
    expect(ec.currency).toBe("USD");
    expect(ec.timezone).toBe("America/Guayaquil");
  });

  it("define la taxonomía de regiones, incluidas Galápagos, Amazonía, Andes y Costa", () => {
    const ids = ec.regions.map((region) => region.id);
    expect(ids).toEqual(
      expect.arrayContaining(["galapagos", "amazonia", "andes", "costa"]),
    );
  });

  it("declara al menos una temporada", () => {
    expect(ec.seasons.length).toBeGreaterThanOrEqual(1);
  });

  it("declara, para el mercado ES, fuentes oficiales de requisitos de entrada y avisos de viaje", () => {
    const es = ec.markets.ES;
    expect(es).toBeDefined();
    if (!es) throw new Error("ec.markets.ES no está definido");
    expect(es.entryRequirements.length).toBeGreaterThanOrEqual(1);
    for (const source of es.entryRequirements) expect(source.url).toMatch(/^https:\/\//);
    expect(es.travelAdvice.length).toBeGreaterThanOrEqual(1);
    for (const source of es.travelAdvice) expect(source.url).toMatch(/^https:\/\//);
    expect(es.adequacyDecision).toBe(false);
  });

  it("el primer aviso de viaje para ES apunta a la ficha oficial de Ecuador de exteriores.gob.es", () => {
    const es = ec.markets.ES;
    if (!es) throw new Error("ec.markets.ES no está definido");
    const [first] = es.travelAdvice;
    expect(first?.url).toContain("exteriores.gob.es");
    expect(first?.url).toContain("recomendaciones-de-viaje");
  });
});

describe("registro de packs de destino", () => {
  it("expone ec por código de país", () => {
    expect(destinationPacks.EC).toBe(ec);
    expect(getDestinationPack("EC")).toBe(ec);
  });

  it("devuelve undefined si no hay pack", () => {
    expect(getDestinationPack("ZZ")).toBeUndefined();
    expect(getDestinationPack("toString")).toBeUndefined();
  });

  it("cada pack del registro valida y está bajo su código de país", () => {
    for (const [country, pack] of Object.entries(destinationPacks)) {
      expect(DestinationPack.safeParse(pack).success).toBe(true);
      expect(pack.country).toBe(country);
    }
  });
});
