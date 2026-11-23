import type { ItineraryDayView } from "../lib/view.js";
import { Section } from "./Section.js";

export interface ItineraryProps {
  title: string;
  days: ItineraryDayView[];
}

/** Itinerario día a día, con la etiqueta de día del pack de mercado ya resuelta. */
export function Itinerary({ title, days }: ItineraryProps) {
  return (
    <Section id="itinerary" title={title}>
      <ol className="space-y-6">
        {days.map((item) => (
          <li key={item.day} className="border-l-4 border-brand pl-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-700">{item.label}</p>
            <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1">{item.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
