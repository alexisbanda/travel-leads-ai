import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { MarketLegalPage } from "@tla/shared";
import { loadLandingsConfig } from "../../../lib/config.js";
import { buildLegalParams } from "../../../lib/params.js";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return buildLegalParams();
}

function findLegalPage(slug: string): MarketLegalPage | undefined {
  const { instance } = loadLandingsConfig();
  return instance.marketPack.legalTexts.pages.find((page) => page.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findLegalPage(slug);
  return page ? { title: page.title } : {};
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findLegalPage(slug);
  if (!page) notFound();

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-prose px-4 py-10">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed">{page.body}</p>
      </div>
    </main>
  );
}
