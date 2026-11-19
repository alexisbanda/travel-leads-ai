import { describe, expect, it } from "vitest";
import {
  activeLeadTasks,
  errorDetail,
  isStaleLeadCreatedEvent,
  LEAD_CREATED_MAX_AGE_MS,
  taskEventType,
  taskIdFor,
} from "./lead-tasks.js";

// ULID ficticio de pruebas.
const LEAD_ID = "01J0000000000000000000000A";
const withPixel = (pixelId: string) => ({ channels: { meta: { pixelId } } });

describe("activeLeadTasks", () => {
  it("con pixelId: crm.upsert, agency.notify y meta.capi.lead", () => {
    expect(activeLeadTasks(withPixel("123456"))).toEqual([
      "crm.upsert",
      "agency.notify",
      "meta.capi.lead",
    ]);
  });

  it.each(["", "  "])("sin pixelId (%j): solo crm.upsert y agency.notify", (pixelId) => {
    expect(activeLeadTasks(withPixel(pixelId))).toEqual(["crm.upsert", "agency.notify"]);
  });
});

describe("taskIdFor", () => {
  it.each([
    ["crm.upsert", `crm-upsert-${LEAD_ID}`],
    ["agency.notify", `agency-notify-${LEAD_ID}`],
    ["meta.capi.lead", `meta-capi-lead-${LEAD_ID}`],
  ] as const)("%s → %s", (action, expected) => {
    expect(taskIdFor(action, LEAD_ID)).toBe(expected);
  });

  it("es determinista y válido para Cloud Tasks", () => {
    const id = taskIdFor("crm.upsert", LEAD_ID);
    expect(taskIdFor("crm.upsert", LEAD_ID)).toBe(id);
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,500}$/);
  });

  it.each(["", "L/1", "L 1", "L.1"])("rechaza un leadId no apto (%j)", (leadId) => {
    expect(() => taskIdFor("crm.upsert", leadId)).toThrow(/leadId inválido/);
  });
});

describe("taskEventType", () => {
  it("compone <acción>.<resultado>", () => {
    expect(taskEventType("crm.upsert", "failed")).toBe("crm.upsert.failed");
    expect(taskEventType("meta.capi.lead", "skipped")).toBe("meta.capi.lead.skipped");
  });
});

describe("errorDetail", () => {
  it("usa el nombre del error, nunca el mensaje", () => {
    class CrmUnavailableError extends Error {
      override name = "CrmUnavailableError";
    }
    expect(errorDetail(new CrmUnavailableError("persona ficticia"))).toBe("CrmUnavailableError");
    expect(errorDetail(new TypeError("x"))).toBe("TypeError");
  });

  it("usa Error si no es un Error o el nombre no es un código válido", () => {
    expect(errorDetail("texto")).toBe("Error");
    const odd = new Error("x");
    odd.name = "nombre con espacios";
    expect(errorDetail(odd)).toBe("Error");
  });
});

describe("isStaleLeadCreatedEvent", () => {
  const now = new Date("2030-01-15T10:00:00.000Z");
  it("acepta eventos recientes y rechaza los que superan la antigüedad máxima", () => {
    expect(isStaleLeadCreatedEvent(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(
      isStaleLeadCreatedEvent(new Date(now.getTime() - LEAD_CREATED_MAX_AGE_MS - 1), now),
    ).toBe(true);
  });
});
