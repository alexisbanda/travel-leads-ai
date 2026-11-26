import type { FooterView } from "../lib/view.js";

export type FooterProps = FooterView;

/**
 * Pie de la instancia: un enlace `/legal/<slug>` por página legal del pack
 * de mercado y, si las hay, las razones sociales de agencia y socio (sin
 * duplicar si coinciden). Sin landmark `nav` propio: es una lista simple.
 */
export function Footer({ links, legalNames }: FooterProps) {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 text-sm sm:px-8">
        <ul className="flex flex-wrap gap-x-8 gap-y-1">
          {links.map((link) => (
            <li key={link.slug}>
              <a
                href={`/legal/${link.slug}`}
                className="inline-flex min-h-[44px] items-center font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-white"
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
        {legalNames.length > 0 ? (
          <p className="mt-6 border-t border-white/10 pt-6 text-slate-400">{legalNames.join(" · ")}</p>
        ) : null}
      </div>
    </footer>
  );
}
