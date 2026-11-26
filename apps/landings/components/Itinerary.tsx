import type { HeroView, ItineraryDayView } from "../lib/view.js";
import { ArrowRightIcon, CheckIcon } from "./icons.js";
import { Section, type SectionTone } from "./Section.js";

export interface ItineraryProps {
  title: string;
  days: ItineraryDayView[];
  tone?: SectionTone;
  /** Resumen de escritorio junto al título: los mismos chips y botón del hero. */
  highlights?: string[];
  cta?: HeroView["cta"];
}

/** Itinerario en línea de tiempo: insignia de día del color de marca y ficha por día. */
export function Itinerary({ title, days, tone, highlights, cta }: ItineraryProps) {
  const aside =
    highlights?.length || cta ? (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {highlights?.length ? (
          <ul className="space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 font-semibold text-slate-900">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-tint text-brand-dark">
                  <CheckIcon className="h-4 w-4" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        {cta ? (
          <a
            href={cta.href}
            className={`${highlights?.length ? "mt-6 " : ""}flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-brand px-6 font-bold text-white shadow-md transition hover:bg-brand-dark`}
          >
            {cta.label}
            <ArrowRightIcon />
          </a>
        ) : null}
      </div>
    ) : undefined;
  return (
    <Section id="itinerary" title={title} tone={tone} split aside={aside}>
      <ol className="relative space-y-5 before:absolute before:top-4 before:bottom-4 before:left-[1.375rem] before:w-0.5 before:bg-brand-light sm:space-y-6 sm:before:left-[1.75rem]">
        {days.map((item) => (
          <li key={item.day} className="relative pl-16 sm:pl-24">
            <span
              aria-hidden="true"
              className="absolute top-4 left-0 flex h-11 w-11 items-center justify-center rounded-full bg-brand font-display text-lg font-extrabold text-white shadow-md ring-4 ring-white sm:h-14 sm:w-14 sm:text-xl"
            >
              {item.day}
            </span>
            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md sm:p-7">
              <p className="text-xs font-bold tracking-widest text-brand-dark uppercase">{item.label}</p>
              <h3 className="mt-1.5 font-display text-xl font-bold text-slate-900 sm:text-2xl">{item.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{item.description}</p>
            </article>
          </li>
        ))}
      </ol>
    </Section>
  );
}
