import { NextResponse } from "next/server";
import { loadLandingsConfig } from "../../lib/config.js";
import { buildSitemapEntries } from "../../lib/seo-index.js";

// Ruta estática: la configuración resuelta es fija en build time.
export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function buildXml(entries: { url: string }[]): string {
  const urls = entries.map((entry) => `  <url><loc>${escapeXml(entry.url)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * `/sitemap.xml`: usamos un route handler (en vez de la convención
 * `app/sitemap.ts`) porque esa convención siempre sirve XML y no permite
 * devolver un 404 real cuando el sitio no debe publicarse (instancia en
 * `draft` o sin `brand.domain`); con un route handler controlamos el
 * `status` de la respuesta y sigue siendo estático (`dynamic = "force-static"`,
 * la configuración resuelta no cambia en runtime).
 */
export function GET(): NextResponse {
  const { instance } = loadLandingsConfig();
  const entries = buildSitemapEntries(instance);
  if (entries === undefined) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(buildXml(entries), {
    headers: { "Content-Type": "application/xml" },
  });
}
