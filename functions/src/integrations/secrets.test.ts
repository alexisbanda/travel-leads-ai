import { describe, expect, it } from "vitest";
import { secretName } from "./secrets.js";

describe("secretName", () => {
  it("quita el prefijo secret:", () => {
    expect(secretName("secret:META_PAGE_ACCESS_TOKEN")).toBe("META_PAGE_ACCESS_TOKEN");
  });
});
