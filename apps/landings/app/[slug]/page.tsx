import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { LandingContent } from "@tla/shared";
import { LandingView } from "../../components/LandingView.js";
import { loadLandingsConfig } from "../../lib/config.js";
import { loadLandings } from "../../lib/content.js";
import { buildLandingParams } from "../../lib/params.js";
import { buildLandingGraph, canonicalUrl } from "../../lib/structured-data.js";
import { buildLandingView } from "../../lib/view.js";

// Literal: Next analiza estáticamente la configuración del segmento.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return buildLandingParams();
}

function findLanding(slug: string): LandingContent | undefined {
  const { instance, isDraft } = loadLandingsConfig();
  return loadLandings(instance.id, { includeDrafts: isDraft }).find(
    (landing) => landing.slug === slug,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const landing = findLanding(slug);
  if (!landing) return {};
  const { instance } = loadLandingsConfig();
  return {
    title: landing.seo.title,
    description: landing.seo.description,
    alternates: { canonical: canonicalUrl(instance, landing.slug) },
  };
}

// Escapa `<` para que el JSON-LD no se interprete como HTML (p. ej. `</script>` en un texto de la landing).
function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landing = findLanding(slug);
  if (!landing) notFound();

  const { instance } = loadLandingsConfig();
  // El endpoint del formulario se calcula aquí, en el servidor (LEAD_ENDPOINT_URL, TLA_ENV).
  const env = { LEAD_ENDPOINT_URL: process.env.LEAD_ENDPOINT_URL, TLA_ENV: process.env.TLA_ENV };
  const view = buildLandingView(landing, instance, { env });
  const graph = buildLandingGraph(landing, instance, view);
  return (
    <>
      {/* JSON-LD generado por el servidor, escapado en serializeJsonLd contra inyección HTML. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }} />
      <LandingView view={view} />
    </>
  );
}
