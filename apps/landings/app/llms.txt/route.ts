import { NextResponse } from "next/server";
import { loadLandingsConfig } from "../../lib/config.js";
import { buildLlmsTxt } from "../../lib/seo-index.js";

// Ruta estática: la configuración resuelta es fija en build time.
export const dynamic = "force-static";

/** `/llms.txt`: se sirve también en `draft`, pero nunca lista landings `draft: true`. */
export function GET(): NextResponse {
  const { instance } = loadLandingsConfig();
  return new NextResponse(buildLlmsTxt(instance), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
