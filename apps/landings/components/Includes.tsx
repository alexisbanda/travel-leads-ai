import { CheckIcon, CrossIcon } from "./icons.js";
import { Section, type SectionTone } from "./Section.js";

export interface IncludesProps {
  title: string;
  includedLabel: string;
  included: string[];
  notIncludedLabel: string;
  notIncluded: string[];
  tone?: SectionTone;
}

/** Qué incluye y qué no incluye el viaje: dos tarjetas con iconos de estado. */
export function Includes({ title, includedLabel, included, notIncludedLabel, notIncluded, tone }: IncludesProps) {
  return (
    <Section id="includes" title={title} tone={tone}>
      <div className={`grid gap-5 ${notIncluded.length > 0 ? "md:grid-cols-2" : "max-w-3xl"}`}>
        <div className="rounded-3xl border-t-4 border-emerald-600 bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h3 className="flex items-center gap-3 font-display text-xl font-bold text-slate-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <CheckIcon />
            </span>
            {includedLabel}
          </h3>
          <ul className="mt-5 space-y-3">
            {included.map((item) => (
              <li key={item} className="flex gap-3 leading-relaxed">
                <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {notIncluded.length > 0 ? (
          <div className="rounded-3xl border-t-4 border-rose-600 bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <h3 className="flex items-center gap-3 font-display text-xl font-bold text-slate-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-800">
                <CrossIcon />
              </span>
              {notIncludedLabel}
            </h3>
            <ul className="mt-5 space-y-3">
              {notIncluded.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed">
                  <CrossIcon className="mt-0.5 h-5 w-5 flex-none text-rose-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
