import { describe, expect, it, vi } from "vitest";
import { buildLlmsTxt, buildRobotsTxt, buildSitemapEntries } from "./seo-index.js";
import { buildLanding, withResolvedInstance } from "./test-fixtures.js";
import type { LandingContent } from "@tla/shared";

const landings: LandingContent[] = [
  buildLanding({ slug: "ejemplo-uno", seo: { title: "Tour uno", description: "Resumen uno." } }),
  buildLanding({ slug: "ejemplo-dos", seo: { title: "Tour dos", description: "Resumen dos." } }),
  buildLanding({ slug: "ejemplo-borrador", draft: true }),
];

vi.mock("./content.js", () => ({
  loadLandings: () => landings.filter((landing) => !landing.draft),
}));

describe("buildRobotsTxt", () => {
  it("con dominio y sin draft, permite todo y apunta al sitemap", () => {
    const instance = withResolvedInstance(() => {});
    expect(buildRobotsTxt(instance)).toBe(
      ["User-agent: *", "Allow: /", "Sitemap: https://ejemplo.test/sitemap.xml", ""].join("\n"),
    );
  });

  it("en draft, bloquea todo y no hay línea Sitemap", () => {
    const instance = withResolvedInstance((clone) => {
      clone.status = "draft";
    });
    const robots = buildRobotsTxt(instance);
    expect(robots).toContain("Disallow: /");
    expect(robots).not.toContain("Sitemap:");
  });

  it("sin brand.domain, bloquea todo aunque no esté en draft", () => {
    const instance = withResolvedInstance((clone) => {
      clone.brand.domain = "";
    });
    const robots = buildRobotsTxt(instance);
    expect(robots).toContain("Disallow: /");
    expect(robots).not.toContain("Sitemap:");
  });
});

describe("buildSitemapEntries", () => {
  it("con dominio y sin draft, una URL por landing publicada (ninguna draft)", () => {
    const instance = withResolvedInstance(() => {});
    const entries = buildSitemapEntries(instance);
    expect(entries).toEqual([
      { url: "https://ejemplo.test/ejemplo-uno" },
      { url: "https://ejemplo.test/ejemplo-dos" },
    ]);
  });

  it("en draft, devuelve undefined (no se publica)", () => {
    const instance = withResolvedInstance((clone) => {
      clone.status = "draft";
    });
    expect(buildSitemapEntries(instance)).toBeUndefined();
  });

  it("sin brand.domain, devuelve undefined", () => {
    const instance = withResolvedInstance((clone) => {
      clone.brand.domain = "";
    });
    expect(buildSitemapEntries(instance)).toBeUndefined();
  });
});

describe("buildLlmsTxt", () => {
  it("lista las landings publicadas con su URL canónica y resumen, sin las draft", () => {
    const instance = withResolvedInstance(() => {});
    const txt = buildLlmsTxt(instance);
    expect(txt).toContain(`# ${instance.brand.displayName}`);
    expect(txt).toContain("- [Tour uno](https://ejemplo.test/ejemplo-uno): Resumen uno.");
    expect(txt).toContain("- [Tour dos](https://ejemplo.test/ejemplo-dos): Resumen dos.");
    expect(txt).not.toContain("ejemplo-borrador");
  });

  it("en draft, se sirve igual pero sin landings draft", () => {
    const instance = withResolvedInstance((clone) => {
      clone.status = "draft";
    });
    const txt = buildLlmsTxt(instance);
    expect(txt).not.toContain("ejemplo-borrador");
  });
});
