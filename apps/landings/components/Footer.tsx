import type { FooterView } from "../lib/view.js";

export type FooterProps = FooterView;

/**
 * Pie de la instancia: un enlace `/legal/<slug>` por página legal del pack
 * de mercado y, si las hay, las razones sociales de agencia y socio (sin
 * duplicar si coinciden). Sin landmark `nav` propio: es una lista simple.
 */
export function Footer({ links, legalNames }: FooterProps) {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-gray-600 sm:px-6">
        <ul className="flex flex-wrap gap-4">
          {links.map((link) => (
            <li key={link.slug}>
              <a href={`/legal/${link.slug}`}>{link.title}</a>
            </li>
          ))}
        </ul>
        {legalNames.length > 0 ? <p className="mt-4">{legalNames.join(" · ")}</p> : null}
      </div>
    </footer>
  );
}
