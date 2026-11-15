import { describe, expect, it } from "vitest";
import { isTerminalStatus } from "./lead-status.js";

describe("isTerminalStatus", () => {
  it("es true para los estados terminales", () => {
    expect(isTerminalStatus("won")).toBe(true);
    expect(isTerminalStatus("lost")).toBe(true);
    expect(isTerminalStatus("invalid")).toBe(true);
  });

  it("es false para estados no terminales", () => {
    expect(isTerminalStatus("new")).toBe(false);
    expect(isTerminalStatus("contacted")).toBe(false);
    expect(isTerminalStatus("unresponsive")).toBe(false);
    expect(isTerminalStatus("qualified")).toBe(false);
    expect(isTerminalStatus("handed_off")).toBe(false);
    expect(isTerminalStatus("quoted")).toBe(false);
  });
});
