import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const VIRTUAL_FILE = "functions/src/domain/__virtual__.ts";

async function restrictedImportErrors(code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const [result] = await eslint.lintText(code, { filePath: VIRTUAL_FILE });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports" && message.severity === 2)
    .map((message) => message.message);
}

describe("pureza de domain/", () => {
  it.each([
    'import { getFirestore } from "firebase-admin/firestore";\nexport const db = getFirestore;\n',
    'import admin from "firebase-admin";\nexport const app = admin;\n',
    'import { onRequest } from "firebase-functions/v2/https";\nexport const fn = onRequest;\n',
    'import Anthropic from "@anthropic-ai/sdk";\nexport const client = Anthropic;\n',
    'import { CloudTasksClient } from "@google-cloud/tasks";\nexport const tasks = CloudTasksClient;\n',
  ])("ESLint rechaza el import en domain/: %s", async (code) => {
    const errors = await restrictedImportErrors(code);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("domain/ es lógica pura: sin Firebase ni SDKs");
  });

  it("ESLint admite módulos node:* y @tla/shared en domain/", async () => {
    const code =
      'import { createHash } from "node:crypto";\nimport type { LeadStatus } from "@tla/shared";\n' +
      "export const h = createHash;\nexport type S = LeadStatus;\n";
    expect(await restrictedImportErrors(code)).toEqual([]);
  });
});
