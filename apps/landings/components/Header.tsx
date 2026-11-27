import Image from "next/image";
import type { HeaderView } from "../lib/view.js";

export type HeaderProps = HeaderView;

/**
 * Cabecera de la instancia: logo de marca si lo hay (`brand.logo`), o si no,
 * su nombre en texto (`buildHeaderView` ya aplica el mismo criterio que
 * `brandName`). Landmark `banner`. Alto fijo: sin saltos de diseño (CLS).
 */
export function Header({ logo, name }: HeaderProps) {
  return (
    <header className="border-t-4 border-brand bg-white shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        {logo ? (
          <Image
            src={logo}
            alt={name}
            width={160}
            height={40}
            className="h-10 w-auto sm:h-12"
            unoptimized={/^https?:\/\//.test(logo)}
          />
        ) : (
          <span className="font-display text-xl font-extrabold tracking-tight text-slate-900">{name}</span>
        )}
      </div>
    </header>
  );
}
