import type { LandingFaqItem } from "@tla/shared";
import { Section } from "./Section.js";

export interface FAQProps {
  title: string;
  items: LandingFaqItem[];
}

/** Preguntas frecuentes con `<details>/<summary>` (sin JavaScript). */
export function FAQ({ title, items }: FAQProps) {
  return (
    <Section id="faq" title={title}>
      <div className="divide-y divide-gray-200">
        {items.map((item) => (
          <details key={item.q} className="py-3">
            <summary className="cursor-pointer font-semibold text-gray-900">{item.q}</summary>
            <p className="mt-2">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
