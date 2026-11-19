import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractLeadgenChanges,
  extractLeadgenIds,
  isValidMetaSignature,
  matchesVerifyToken,
} from "./meta-signature.js";

const SECRET = "test-app-secret";
const BODY = Buffer.from('{"object":"page","entry":[]}');

function sign(body: Buffer, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("isValidMetaSignature", () => {
  it("acepta la firma correcta del cuerpo crudo", () => {
    expect(isValidMetaSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("acepta el hex en mayúsculas", () => {
    const header = "sha256=" + sign(BODY).slice("sha256=".length).toUpperCase();
    expect(isValidMetaSignature(BODY, header, SECRET)).toBe(true);
  });

  it("rechaza la firma hecha con otro secreto", () => {
    expect(isValidMetaSignature(BODY, sign(BODY, "otro-secreto"), SECRET)).toBe(false);
  });

  it("rechaza si el cuerpo cambió", () => {
    const other = Buffer.from('{"object":"page","entry":[{}]}');
    expect(isValidMetaSignature(other, sign(BODY), SECRET)).toBe(false);
  });

  it.each([
    ["ausente", undefined],
    ["vacía", ""],
    ["sin prefijo", sign(BODY).slice("sha256=".length)],
    ["otro algoritmo", "sha1=" + "a".repeat(40)],
    ["más corta", "sha256=abcd"],
    ["más larga", sign(BODY) + "00"],
    ["no hex", "sha256=" + "z".repeat(64)],
  ])("rechaza la cabecera %s sin lanzar", (_label, header) => {
    expect(() => isValidMetaSignature(BODY, header, SECRET)).not.toThrow();
    expect(isValidMetaSignature(BODY, header, SECRET)).toBe(false);
  });

  it("rechaza si el secreto configurado está vacío", () => {
    expect(isValidMetaSignature(BODY, sign(BODY, ""), "")).toBe(false);
  });
});

describe("matchesVerifyToken", () => {
  it("coincide solo con el token exacto", () => {
    expect(matchesVerifyToken("token-de-prueba", "token-de-prueba")).toBe(true);
    expect(matchesVerifyToken("token-de-prueb", "token-de-prueba")).toBe(false);
    expect(matchesVerifyToken(undefined, "token-de-prueba")).toBe(false);
    expect(matchesVerifyToken(["token-de-prueba"], "token-de-prueba")).toBe(false);
  });

  it("nunca coincide si el esperado está vacío", () => {
    expect(matchesVerifyToken("", "")).toBe(false);
  });
});

describe("extractLeadgenIds", () => {
  it("devuelve todos los leadgen_id de entry[].changes[]", () => {
    const payload = {
      object: "page",
      entry: [
        {
          changes: [
            { field: "leadgen", value: { leadgen_id: "000000000000001" } },
            { field: "feed", value: { leadgen_id: "000000000000009" } },
          ],
        },
        { changes: [{ field: "leadgen", value: { leadgen_id: 2 } }] },
      ],
    };
    expect(extractLeadgenIds(payload)).toEqual(["000000000000001", "2"]);
    expect(extractLeadgenChanges(payload)[0]?.value).toEqual({ leadgen_id: "000000000000001" });
  });

  it.each([
    null,
    "texto",
    [],
    {},
    { entry: "x" },
    { entry: [null, { changes: null }, { changes: [null, { field: "leadgen" }] }] },
    { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "  " } }] }] },
    { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: {} } }] }] },
  ])("ignora formas inesperadas (%j)", (payload) => {
    expect(extractLeadgenIds(payload)).toEqual([]);
  });
});
