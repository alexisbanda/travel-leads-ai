import { ChatIcon } from "./icons.js";

export interface WhatsAppCTAProps {
  /** Texto del botón (`landingUi.whatsappCta`). */
  label: string;
  /** Enlace `wa.me` con el mensaje predefinido ya codificado. */
  href: string;
}

/** Llamada a la acción principal: abre WhatsApp con el mensaje predefinido. */
export function WhatsAppCTA({ label, href }: WhatsAppCTAProps) {
  return (
    <section aria-label={label} className="px-5 text-center">
      <a
        href={href}
        className="inline-flex min-h-[56px] items-center gap-3 rounded-full bg-brand px-9 py-4 text-lg font-bold text-white shadow-xl shadow-black/30 transition hover:bg-brand-dark focus-visible:outline-white"
      >
        <ChatIcon className="h-6 w-6" />
        {label}
      </a>
    </section>
  );
}
