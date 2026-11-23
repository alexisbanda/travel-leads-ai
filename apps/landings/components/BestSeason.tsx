import { Section } from "./Section.js";

export interface BestSeasonProps {
  title: string;
  summary: string;
}

/** Resumen de la mejor época para viajar. */
export function BestSeason({ title, summary }: BestSeasonProps) {
  return (
    <Section id="best-season" title={title}>
      <p>{summary}</p>
    </Section>
  );
}
