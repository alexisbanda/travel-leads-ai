import { Ulid } from "@tla/shared";
import { describe, expect, it } from "vitest";
import { ulid } from "./ulid.js";

const zeros = (size: number) => new Uint8Array(size);
const ones = (size: number) => new Uint8Array(size).fill(0xff);

describe("ulid", () => {
  it("cumple el esquema Ulid", () => {
    expect(Ulid.safeParse(ulid()).success).toBe(true);
    expect(Ulid.safeParse(ulid(Date.UTC(2030, 0, 1), ones)).success).toBe(true);
  });

  it("codifica el instante en los 10 primeros caracteres", () => {
    expect(ulid(0, zeros)).toBe("0".repeat(26));
    expect(ulid(32, zeros).slice(0, 10)).toBe("0000000010");
    expect(ulid(2 ** 48 - 1, ones)).toBe("7ZZZZZZZZZ" + "Z".repeat(16));
  });

  it("ordena lexicográficamente por instante", () => {
    expect(ulid(1000) < ulid(2000)).toBe(true);
  });

  it("no repite valores", () => {
    const ids = new Set(Array.from({ length: 100 }, () => ulid(5)));
    expect(ids.size).toBe(100);
  });

  it("rechaza instantes fuera de rango", () => {
    expect(() => ulid(-1)).toThrow(/rango/);
    expect(() => ulid(2 ** 48)).toThrow(/rango/);
  });
});
