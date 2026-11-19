import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createAgencyNotifyTaskFunction,
  createCrmUpsertTaskFunction,
  createMetaCapiLeadTaskFunction,
  LEAD_TASK_RATE_LIMITS,
  LEAD_TASK_RETRY_CONFIG,
} from "./lead-task-functions.js";
import { LEAD_TASK_FUNCTIONS } from "./names.js";

describe("definición de las tareas", () => {
  const functions = {
    crmUpsertTask: createCrmUpsertTaskFunction({ channels: { crm: { provider: "memory" } } }),
    agencyNotifyTask: createAgencyNotifyTaskFunction({ agency: {} }),
    metaCapiLeadTask: createMetaCapiLeadTaskFunction(),
  };

  it.each(Object.entries(functions))(
    "%s declara retryConfig y rateLimits en su cola",
    (_name, fn) => {
      const trigger = fn.__endpoint.taskQueueTrigger;
      expect(trigger?.retryConfig).toMatchObject(LEAD_TASK_RETRY_CONFIG);
      expect(trigger?.rateLimits).toMatchObject(LEAD_TASK_RATE_LIMITS);
      expect(LEAD_TASK_RETRY_CONFIG.maxAttempts).toBeGreaterThan(1);
    },
  );

  it("index.ts exporta cada tarea con el nombre de su cola", () => {
    const index = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
    for (const name of Object.values(LEAD_TASK_FUNCTIONS)) {
      expect(index).toMatch(new RegExp(`export const ${name} = `));
      expect(Object.keys(functions)).toContain(name);
    }
    expect(index).toMatch(/export const onLeadCreated = /);
  });
});
