import { describe, expect, it } from "vitest";
import { LeadStatus } from "./lead.js";

describe("LeadStatus", () => {
  it("acepta un estado válido de la máquina de estados", () => {
    expect(LeadStatus.parse("qualified")).toBe("qualified");
  });

  it("rechaza un estado que no existe en la máquina de estados", () => {
    expect(() => LeadStatus.parse("unknown")).toThrow();
  });
});
