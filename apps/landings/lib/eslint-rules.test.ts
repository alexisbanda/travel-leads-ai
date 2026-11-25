import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("@next/next/no-img-element (presupuesto de rendimiento)", () => {
  it("marca <img> como error en apps/landings", async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const results = await eslint.lintText(
      'export const Trampa = () => <img src="/x.png" alt="" />;\n',
      { filePath: "apps/landings/components/Trampa.tsx" },
    );
    const [result] = results;
    expect(result).toBeDefined();

    const noImgElementMessages = result!.messages.filter(
      (message) => message.ruleId === "@next/next/no-img-element",
    );
    expect(noImgElementMessages).toHaveLength(1);
    expect(noImgElementMessages[0]?.severity).toBe(2);
  });
});
