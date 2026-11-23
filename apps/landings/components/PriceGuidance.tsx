import { Section } from "./Section.js";

export interface PriceGuidanceProps {
  title: string;
  /** Texto «desde» ya formateado con el locale y la moneda del mercado. */
  priceText: string;
  /** Aviso de precio orientativo del pack de mercado; se muestra siempre. */
  disclaimer: string;
}

/** Precio orientativo, siempre acompañado del aviso del pack (no es una oferta). */
export function PriceGuidance({ title, priceText, disclaimer }: PriceGuidanceProps) {
  return (
    <Section id="price-guidance" title={title}>
      <p className="text-2xl font-semibold text-gray-900">{priceText}</p>
      <p className="mt-2 text-sm text-gray-700">{disclaimer}</p>
    </Section>
  );
}
