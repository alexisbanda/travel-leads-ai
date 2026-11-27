import { SunIcon } from "./icons.js";

export interface BestSeasonProps {
  title: string;
  summary: string;
}

/** Mejor época para viajar, como tarjeta destacada (va dentro de una banda de `LandingView`). */
export function BestSeason({ title, summary }: BestSeasonProps) {
  return (
    <section
      id="best-season"
      aria-labelledby="best-season-title"
      className="flex flex-col rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 sm:p-10"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand-dark ring-1 ring-brand-light">
        <SunIcon className="h-7 w-7" />
      </span>
      <h2 id="best-season-title" className="mt-6 font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-slate-700">{summary}</p>
    </section>
  );
}
