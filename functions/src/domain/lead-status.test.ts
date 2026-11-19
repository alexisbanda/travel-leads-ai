import { LeadStatus } from "@tla/shared";
import { describe, expect, it } from "vitest";
import { canTransition, isOpen, isTerminalStatus } from "./lead-status.js";

const STATUSES = LeadStatus.options;

/** Transiciones del diagrama de docs/02-modelo-de-datos.md, escritas a mano. */
const ALLOWED = new Set([
  "new->contacted",
  "contacted->qualified",
  "contacted->unresponsive",
  "qualified->handed_off",
  "handed_off->quoted",
  "quoted->won",
  "quoted->lost",
  "unresponsive->contacted",
  "new->invalid",
]);

describe("canTransition", () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

  it.each(pairs)("%s -> %s coincide con el diagrama", (from, to) => {
    expect(canTransition(from, to)).toBe(ALLOWED.has(`${from}->${to}`));
  });

  it("cubre los ejemplos de los criterios de aceptación", () => {
    expect(canTransition("qualified", "handed_off")).toBe(true);
    expect(canTransition("lost", "qualified")).toBe(false);
    expect(canTransition("new", "contacted")).toBe(true);
    expect(canTransition("won", "new")).toBe(false);
  });

  it("no permite quedarse en el mismo estado", () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(false);
  });
});

describe("isOpen", () => {
  it("es false para won, lost e invalid", () => {
    expect(isOpen("won")).toBe(false);
    expect(isOpen("lost")).toBe(false);
    expect(isOpen("invalid")).toBe(false);
  });

  it("es true para el resto de estados", () => {
    for (const status of STATUSES.filter((s) => !["won", "lost", "invalid"].includes(s))) {
      expect(isOpen(status)).toBe(true);
    }
  });
});

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

  it("coincide con los estados cerrados", () => {
    for (const status of STATUSES) expect(isTerminalStatus(status)).toBe(!isOpen(status));
  });
});
