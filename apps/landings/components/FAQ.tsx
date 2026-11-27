import type { LandingFaqItem } from "@tla/shared";
import { PlusIcon } from "./icons.js";
import { Section, type SectionTone } from "./Section.js";

export interface FAQProps {
  title: string;
  items: LandingFaqItem[];
  tone?: SectionTone;
}

/** Preguntas frecuentes en acordeón con `<details>/<summary>` (sin JavaScript). */
export function FAQ({ title, items, tone }: FAQProps) {
  return (
    <Section id="faq" title={title} tone={tone} split>
      <div className="space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition open:shadow-md open:ring-brand-light"
          >
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 font-display text-lg font-bold text-slate-900 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-tint text-brand-dark transition-transform group-open:rotate-45 motion-reduce:transition-none">
                <PlusIcon />
              </span>
            </summary>
            <p className="px-5 pb-5 leading-relaxed text-slate-700 sm:px-6">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
