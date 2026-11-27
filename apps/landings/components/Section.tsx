import type { ReactNode } from "react";

/** Fondo de una banda de sección: blanco o tinte de marca (se alternan en `LandingView`). */
export type SectionTone = "white" | "tint";

export const toneClass: Record<SectionTone, string> = {
  white: "bg-white",
  tint: "bg-brand-tint",
};

/** Contenedor de ancho común de la landing. */
export const containerClass = "mx-auto w-full max-w-6xl px-5 sm:px-8";

/** Título de sección con acento de marca. */
export function SectionHeading({ id, title, className }: { id: string; title: string; className?: string }) {
  return (
    <div className={className}>
      <span aria-hidden="true" className="block h-1.5 w-14 rounded-full bg-brand" />
      <h2
        id={id}
        className="mt-4 font-display text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl"
      >
        {title}
      </h2>
    </div>
  );
}

/**
 * Contenedor común de sección: banda a todo el ancho, `<section aria-labelledby>`
 * con su `<h2>`. Con `split`, en escritorio el título (y `aside`) queda en una
 * columna fija a la izquierda y el contenido a la derecha.
 */
export function Section({
  id,
  title,
  tone = "white",
  split = false,
  aside,
  children,
}: {
  id: string;
  title: string;
  tone?: SectionTone;
  split?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  if (!split) {
    return (
      <section id={id} aria-labelledby={headingId} className={`${toneClass[tone]} py-14 sm:py-24`}>
        <div className={containerClass}>
          <SectionHeading id={headingId} title={title} />
          <div className="mt-8 text-slate-700 sm:mt-10">{children}</div>
        </div>
      </section>
    );
  }
  return (
    <section id={id} aria-labelledby={headingId} className={`${toneClass[tone]} py-14 sm:py-24`}>
      <div className={`${containerClass} lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <div className="lg:sticky lg:top-8 lg:self-start">
          <SectionHeading id={headingId} title={title} />
          {aside ? <div className="mt-6 hidden lg:block">{aside}</div> : null}
        </div>
        <div className="mt-8 text-slate-700 sm:mt-10 lg:mt-0">{children}</div>
      </div>
    </section>
  );
}
