export interface WhatsAppCTAProps {
  /** Texto del botón (`landingUi.whatsappCta`). */
  label: string;
  /** Enlace `wa.me` con el mensaje predefinido ya codificado. */
  href: string;
}

/** Llamada a la acción principal: abre WhatsApp con el mensaje predefinido. */
export function WhatsAppCTA({ label, href }: WhatsAppCTAProps) {
  return (
    <section aria-label={label} className="px-4 py-10 text-center sm:px-6">
      <a
        href={href}
        className="inline-block rounded-full bg-brand px-8 py-4 text-lg font-semibold text-white shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400"
      >
        {label}
      </a>
    </section>
  );
}
