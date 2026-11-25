import type { LandingView as LandingViewModel, SectionView } from "../lib/view.js";
import { BestSeason } from "./BestSeason.js";
import { FAQ } from "./FAQ.js";
import { Hero } from "./Hero.js";
import { Includes } from "./Includes.js";
import { Itinerary } from "./Itinerary.js";
import { LeadForm } from "./LeadForm.js";
import { PriceGuidance } from "./PriceGuidance.js";
import { Trust } from "./Trust.js";
import { WhatsAppCTA } from "./WhatsAppCTA.js";

function renderSection(section: SectionView) {
  switch (section.kind) {
    case "itinerary":
      return <Itinerary key={section.kind} title={section.title} days={section.days} />;
    case "includes":
      return (
        <Includes
          key={section.kind}
          title={section.title}
          includedLabel={section.includedLabel}
          included={section.included}
          notIncludedLabel={section.notIncludedLabel}
          notIncluded={section.notIncluded}
        />
      );
    case "bestSeason":
      return <BestSeason key={section.kind} title={section.title} summary={section.summary} />;
    case "priceGuidance":
      return (
        <PriceGuidance
          key={section.kind}
          title={section.title}
          priceText={section.priceText}
          disclaimer={section.disclaimer}
        />
      );
    case "faq":
      return <FAQ key={section.kind} title={section.title} items={section.items} />;
    case "trust":
      return <Trust key={section.kind} title={section.title} phone={section.phone} agency={section.agency} />;
    case "cta":
      return <WhatsAppCTA key={section.kind} label={section.label} href={section.href} />;
    case "form":
      return <LeadForm key={section.kind} {...section.form} />;
  }
}

/** Página de landing: hero primero y después las secciones en el orden de `sections`. */
export function LandingView({ view }: { view: LandingViewModel }) {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <Hero {...view.hero} />
      {view.sections.map(renderSection)}
    </main>
  );
}
