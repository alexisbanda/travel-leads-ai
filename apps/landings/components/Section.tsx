import type { ReactNode } from "react";

/** Contenedor común de sección: `<section aria-labelledby>` con su `<h2>`. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="border-t border-gray-200 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 id={headingId} className="text-2xl font-bold text-gray-900">
          {title}
        </h2>
        <div className="mt-4 text-gray-800">{children}</div>
      </div>
    </section>
  );
}
