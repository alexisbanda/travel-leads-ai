import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { LandingContent } from "@tla/shared";
import { JsonLdScript } from "../../components/JsonLdScript.js";
import { LandingView } from "../../components/LandingView.js";
import { loadLandingsConfig } from "../../lib/config.js";
import { loadLandings } from "../../lib/content.js";
import { defaultMediaDir } from "../../lib/media.js";
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

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landing = findLanding(slug);
  if (!landing) notFound();

  const { instance, isDraft } = loadLandingsConfig();
  // El endpoint del formulario se calcula aquí, en el servidor (LEAD_ENDPOINT_URL, TLA_ENV).
  const env = { LEAD_ENDPOINT_URL: process.env.LEAD_ENDPOINT_URL, TLA_ENV: process.env.TLA_ENV };
  const view = buildLandingView(landing, instance, {
    env,
    media: { mediaDir: defaultMediaDir(instance.id), isDraft },
  });
  const graph = buildLandingGraph(landing, instance, view);
  return (
    <>
      <JsonLdScript graph={graph} />
      <LandingView view={view} />
    </>
  );
}
