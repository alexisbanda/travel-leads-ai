import { Section } from "./Section.js";

export interface TrustProps {
  title: string;
  phone?: { label: string; display: string; href: string };
  agency?: { label: string; name: string };
}

/** Datos de confianza: teléfono de contacto y razón social de la agencia. */
export function Trust({ title, phone, agency }: TrustProps) {
  return (
    <Section id="trust" title={title}>
      <dl className="grid gap-4 sm:grid-cols-2">
        {phone ? (
          <div>
            <dt className="text-sm font-semibold text-gray-700">{phone.label}</dt>
            <dd className="mt-1">
              <a href={phone.href} className="text-gray-900 underline">
                {phone.display}
              </a>
            </dd>
          </div>
        ) : null}
        {agency ? (
          <div>
            <dt className="text-sm font-semibold text-gray-700">{agency.label}</dt>
            <dd className="mt-1 text-gray-900">{agency.name}</dd>
          </div>
        ) : null}
      </dl>
    </Section>
  );
}
