import type { LandingContent, ResolvedInstanceConfig } from "@tla/shared";
import { loadLandings } from "./content.js";
import { canonicalUrl, siteUrl } from "./structured-data.js";

/**
 * Landings publicadas de una instancia (nunca `draft`, ni siquiera cuando la
 * propia instancia está en `status: draft`): son las únicas que aparecen en
 * `sitemap.xml` y `llms.txt`.
 */
export function publishedLandings(instance: ResolvedInstanceConfig): LandingContent[] {
  return loadLandings(instance.id, { includeDrafts: false });
}

/** `true` si el sitio no debe indexarse: instancia en `draft` o sin dominio propio. */
export function isUnpublishable(instance: ResolvedInstanceConfig): boolean {
  return instance.status === "draft" || instance.brand.domain.trim() === "";
}

/** Cuerpo de `robots.txt`: sin dominio o en `draft`, bloquea todo el sitio. */
export function buildRobotsTxt(instance: ResolvedInstanceConfig): string {
  if (isUnpublishable(instance)) {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }
  const base = siteUrl(instance);
  return ["User-agent: *", "Allow: /", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}

export interface SitemapEntry {
  url: string;
}

/**
 * Entradas de `sitemap.xml`. `undefined` cuando el sitio no debe publicarse
 * (en `draft` o sin dominio): el route handler responde 404 en ese caso.
 */
export function buildSitemapEntries(instance: ResolvedInstanceConfig): SitemapEntry[] | undefined {
  if (isUnpublishable(instance)) return undefined;
  return publishedLandings(instance).map((landing) => ({
    url: canonicalUrl(instance, landing.slug),
  }));
}

/**
 * Contenido de `llms.txt` (formato llms.txt): título, resumen y una lista de
 * landings publicadas con su URL canónica y el resumen de `seo.description`.
 * Puede servirse en `draft`, pero nunca lista landings `draft: true`.
 */
export function buildLlmsTxt(instance: ResolvedInstanceConfig): string {
  const lines = [
    `# ${instance.brand.displayName}`,
    "",
    `> Published pages for agents and search engines.`,
    "",
  ];
  for (const landing of publishedLandings(instance)) {
    const url = canonicalUrl(instance, landing.slug);
    lines.push(`- [${landing.seo.title}](${url}): ${landing.seo.description}`);
  }
  return lines.join("\n");
}
