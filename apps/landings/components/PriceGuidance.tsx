import { InfoIcon, TagIcon } from "./icons.js";

export interface PriceGuidanceProps {
  title: string;
  /** Texto «desde» ya formateado con el locale y la moneda del mercado. */
  priceText: string;
  /** Aviso de precio orientativo del pack de mercado; se muestra siempre, junto al precio. */
  disclaimer: string;
}

/** Precio orientativo en tarjeta destacada, siempre con el aviso del pack (no es una oferta). */
export function PriceGuidance({ title, priceText, disclaimer }: PriceGuidanceProps) {
  return (
    <section
      id="price-guidance"
      aria-labelledby="price-guidance-title"
      className="flex flex-col rounded-3xl bg-gradient-to-br from-brand to-brand-dark p-7 text-white shadow-xl sm:p-10"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
        <TagIcon className="h-7 w-7" />
      </span>
      <h2 id="price-guidance-title" className="mt-6 font-display text-2xl font-extrabold sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 font-display text-3xl leading-tight font-extrabold text-balance sm:text-4xl">{priceText}</p>
      <p className="mt-6 flex gap-3 rounded-2xl bg-black/20 p-4 text-sm leading-relaxed text-white">
        <InfoIcon className="mt-0.5 h-5 w-5 flex-none" />
        <span>{disclaimer}</span>
      </p>
    </section>
  );
}
