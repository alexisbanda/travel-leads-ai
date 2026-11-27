import { BuildingIcon, ChatIcon } from "./icons.js";
import { Section, type SectionTone } from "./Section.js";

export interface TrustProps {
  title: string;
  phone?: { label: string; display: string; href: string };
  agency?: { label: string; name: string };
  tone?: SectionTone;
}

const cardClass = "relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8";
const iconClass =
  "absolute top-6 left-6 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand text-white sm:top-8 sm:left-8";
const bodyClass = "pl-16";

/** Datos de confianza: teléfono de contacto y razón social de la agencia. */
export function Trust({ title, phone, agency, tone }: TrustProps) {
  return (
    <Section id="trust" title={title} tone={tone}>
      <dl className="grid gap-5 md:grid-cols-2">
        {phone ? (
          <div className={cardClass}>
            <dt className={bodyClass}>
              <span className={iconClass}>
                <ChatIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold tracking-wider text-slate-600 uppercase">
                {phone.label}
              </span>
            </dt>
            <dd className={`${bodyClass} mt-1`}>
              <a
                href={phone.href}
                className="inline-flex min-h-[44px] items-center font-display text-xl font-bold text-slate-900 underline decoration-brand decoration-2 underline-offset-4"
              >
                {phone.display}
              </a>
            </dd>
          </div>
        ) : null}
        {agency ? (
          <div className={cardClass}>
            <dt className={bodyClass}>
              <span className={iconClass}>
                <BuildingIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold tracking-wider text-slate-600 uppercase">
                {agency.label}
              </span>
            </dt>
            <dd className={`${bodyClass} mt-1 py-2 font-display text-xl font-bold text-slate-900`}>
              {agency.name}
            </dd>
          </div>
        ) : null}
      </dl>
    </Section>
  );
}
