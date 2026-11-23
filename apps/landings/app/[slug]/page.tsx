import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { LandingContent } from "@tla/shared";
import { loadLandingsConfig } from "../../lib/config.js";
import { loadLandings } from "../../lib/content.js";
import { buildLandingParams } from "../../lib/params.js";

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
  return { title: landing.seo.title, description: landing.seo.description };
}

function whatsappHref(number: string, prefill: string | undefined): string | undefined {
  if (number.trim() === "") return undefined;
  const base = `https://wa.me/${number.replace(/^\+/, "")}`;
  return prefill === undefined ? base : `${base}?text=${encodeURIComponent(prefill)}`;
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
  const href = whatsappHref(instance.channels.whatsapp.number, landing.cta.prefill);

  return (
    <main>
      <h1>{landing.hero.headline}</h1>
      {landing.hero.subheadline ? <p>{landing.hero.subheadline}</p> : null}
      {landing.faq ? (
        <section>
          {landing.faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      ) : null}
      {landing.cta.type === "whatsapp" && href ? <a href={href}>WhatsApp</a> : null}
    </main>
  );
}
