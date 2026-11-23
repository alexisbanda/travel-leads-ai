import { Section } from "./Section.js";

export interface IncludesProps {
  title: string;
  includedLabel: string;
  included: string[];
  notIncludedLabel: string;
  notIncluded: string[];
}

/** Qué incluye y qué no incluye el viaje. */
export function Includes({ title, includedLabel, included, notIncludedLabel, notIncluded }: IncludesProps) {
  return (
    <Section id="includes" title={title}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold text-gray-900">{includedLabel}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {included.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        {notIncluded.length > 0 ? (
          <div>
            <h3 className="font-semibold text-gray-900">{notIncludedLabel}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {notIncluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
