"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon } from "./icons.js";

export interface MobileCtaBarProps {
  /** `landingUi.heroCta`. */
  label: string;
  /** Ancla del bloque de contacto (`#contact`). */
  href: string;
  /** Id del hero: la barra aparece cuando sale de la pantalla. */
  heroId: string;
  /** Id del bloque de contacto: la barra se oculta al llegar a él (no lo tapa). */
  targetId: string;
}

/**
 * Barra fija de contacto en móvil (oculta desde `md`). Aparece al dejar
 * atrás el hero y desaparece al llegar al bloque de contacto o pasarlo. Es
 * `position: fixed` y se mueve con `transform`: no desplaza contenido (sin CLS).
 */
export function MobileCtaBar({ label, href, heroId, targetId }: MobileCtaBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById(heroId);
    const target = document.getElementById(targetId);
    let heroGone = false;
    let targetReached = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroGone = !entry.isIntersecting;
        if (entry.target === target) targetReached = entry.isIntersecting || entry.boundingClientRect.top < 0;
      }
      setVisible(heroGone && !targetReached);
    });
    if (hero) observer.observe(hero);
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [heroId, targetId]);

  return (
    <div
      data-testid="mobile-cta-bar"
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 motion-reduce:transition-none md:hidden ${
        visible ? "translate-y-0" : "translate-y-[120%]"
      }`}
    >
      <div className="border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur">
        <a
          href={href}
          tabIndex={visible ? undefined : -1}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-lg font-bold text-white shadow-md"
        >
          {label}
          <ArrowRightIcon />
        </a>
      </div>
    </div>
  );
}
