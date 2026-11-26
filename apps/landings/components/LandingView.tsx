import { CONTACT_ANCHOR, type LandingView as LandingViewModel, type SectionView } from "../lib/view.js";
import { BestSeason } from "./BestSeason.js";
import { FAQ } from "./FAQ.js";
import { Gallery } from "./Gallery.js";
import { HERO_ID, Hero } from "./Hero.js";
import { Includes } from "./Includes.js";
import { Itinerary } from "./Itinerary.js";
import { LeadForm } from "./LeadForm.js";
import { MobileCtaBar } from "./MobileCtaBar.js";
import { PriceGuidance } from "./PriceGuidance.js";
import { containerClass, type SectionTone, toneClass } from "./Section.js";
import { Trust } from "./Trust.js";
import { WhatsAppCTA } from "./WhatsAppCTA.js";

type CardSection = Extract<SectionView, { kind: "bestSeason" | "priceGuidance" }>;
type ContactSection = Extract<SectionView, { kind: "cta" | "form" }>;

/** Bloques visuales: las tarjetas contiguas (época y precio) comparten banda. */
type Block =
  | { kind: "cards"; sections: CardSection[] }
  | { kind: "contact"; section: ContactSection }
  | { kind: "single"; section: Exclude<SectionView, CardSection | ContactSection> };

function toBlocks(sections: SectionView[]): Block[] {
  const blocks: Block[] = [];
  for (const section of sections) {
    if (section.kind === "bestSeason" || section.kind === "priceGuidance") {
      const last = blocks.at(-1);
      if (last?.kind === "cards") last.sections.push(section);
      else blocks.push({ kind: "cards", sections: [section] });
    } else if (section.kind === "cta" || section.kind === "form") {
      blocks.push({ kind: "contact", section });
    } else {
      blocks.push({ kind: "single", section });
    }
  }
  return blocks;
}

function renderCard(section: CardSection) {
  return section.kind === "bestSeason" ? (
    <BestSeason key={section.kind} title={section.title} summary={section.summary} />
  ) : (
    <PriceGuidance key={section.kind} title={section.title} priceText={section.priceText} disclaimer={section.disclaimer} />
  );
}

function renderSingle(
  section: Extract<Block, { kind: "single" }>["section"],
  tone: SectionTone,
  hero: LandingViewModel["hero"],
) {
  switch (section.kind) {
    case "itinerary":
      return (
        <Itinerary
          key={section.kind}
          title={section.title}
          days={section.days}
          tone={tone}
          {...(hero.highlights ? { highlights: hero.highlights } : {})}
          {...(hero.cta ? { cta: hero.cta } : {})}
        />
      );
    case "gallery":
      return <Gallery key={section.kind} title={section.title} images={section.images} tone={tone} />;
    case "includes":
      return (
        <Includes
          key={section.kind}
          title={section.title}
          includedLabel={section.includedLabel}
          included={section.included}
          notIncludedLabel={section.notIncludedLabel}
          notIncluded={section.notIncluded}
          tone={tone}
        />
      );
    case "faq":
      return <FAQ key={section.kind} title={section.title} items={section.items} tone={tone} />;
    case "trust":
      return <Trust key={section.kind} title={section.title} phone={section.phone} agency={section.agency} tone={tone} />;
  }
}

function renderBlock(
  block: Block,
  index: number,
  hero: LandingViewModel["hero"],
  contactAnchorUsed: { value: boolean },
) {
  const tone: SectionTone = index % 2 === 0 ? "tint" : "white";
  switch (block.kind) {
    case "single":
      return renderSingle(block.section, tone, hero);
    case "cards":
      return (
        <div key={`cards-${index}`} className={`${toneClass[tone]} py-14 sm:py-24`}>
          <div
            className={`${containerClass} grid gap-5 ${block.sections.length > 1 ? "md:grid-cols-2" : "max-w-3xl"}`}
          >
            {block.sections.map(renderCard)}
          </div>
        </div>
      );
    case "contact": {
      // El ancla de contacto va en el primer bloque de contacto.
      const id = contactAnchorUsed.value ? undefined : CONTACT_ANCHOR;
      contactAnchorUsed.value = true;
      const { section } = block;
      return (
        <div key={`contact-${index}`} id={id} className="scroll-mt-4 bg-brand-deep bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-brand)_35%,transparent)_0%,transparent_60%)] py-14 sm:py-24">
          <div className={containerClass}>
            {section.kind === "form" ? (
              <LeadForm {...section.form} />
            ) : (
              <WhatsAppCTA label={section.label} href={section.href} />
            )}
          </div>
        </div>
      );
    }
  }
}

/** Página de landing: hero primero y después las secciones en el orden de `sections`. */
export function LandingView({ view }: { view: LandingViewModel }) {
  const contactAnchorUsed = { value: false };
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <Hero {...view.hero} />
      {toBlocks(view.sections).map((block, index) => renderBlock(block, index, view.hero, contactAnchorUsed))}
      {view.hero.cta ? (
        <MobileCtaBar label={view.hero.cta.label} href={view.hero.cta.href} heroId={HERO_ID} targetId={CONTACT_ANCHOR} />
      ) : null}
    </main>
  );
}
