import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.js";

describe("next.config images", () => {
  it("sirve AVIF y WebP (presupuesto de rendimiento, docs/04-landings.md#rendimiento)", () => {
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
  });
});
