import Image from "next/image";
import type { HeaderView } from "../lib/view.js";

export type HeaderProps = HeaderView;

/**
 * Cabecera de la instancia: logo de marca si lo hay (`brand.logo`), o si no,
 * su nombre en texto (`buildHeaderView` ya aplica el mismo criterio que
 * `brandName`). Landmark `banner`.
 */
export function Header({ logo, name }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center px-4 py-3 sm:px-6">
        {logo ? (
          <Image
            src={logo}
            alt={name}
            width={160}
            height={40}
            className="h-10 w-auto"
            unoptimized={/^https?:\/\//.test(logo)}
          />
        ) : (
          <span className="text-lg font-semibold text-gray-900">{name}</span>
        )}
      </div>
    </header>
  );
}
