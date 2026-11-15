import { describe, expect, it } from "vitest";
import { LeadStatus } from "./lead.js";

describe("LeadStatus", () => {
  it("acepta un estado válido de la máquina de estados", () => {
    expect(LeadStatus.parse("qualified")).toBe("qualified");
  });

  it("rechaza un estado que no existe en la máquina de estados", () => {
    expect(() => LeadStatus.parse("unknown")).toThrow();
  });

  it("tiene exactamente los 9 estados de docs/02-modelo-de-datos.md", () => {
    expect(LeadStatus.options).toEqual([
      "new",
      "contacted",
      "unresponsive",
      "qualified",
      "handed_off",
      "quoted",
      "won",
      "lost",
      "invalid",
    ]);
  });
});
