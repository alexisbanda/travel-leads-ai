"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "./icons.js";

/** Condición de reproducción automática: escritorio y sin preferencia de movimiento reducido. */
export const AUTOPLAY_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

export interface HeroVideoProps {
  src: string;
  poster?: string;
  alt: string;
  /** Valor CSS de `object-position` para el encuadre. */
  objectPosition?: string;
  /** Etiquetas del botón (`landingUi.videoPlay`/`videoPause`). */
  controls: { play: string; pause: string };
}

/**
 * Vídeo de fondo del hero. Se reproduce solo (silenciado y en bucle) si se
 * cumple `AUTOPLAY_QUERY`; si no, queda la imagen de portada. Siempre hay un
 * botón visible para pausar o reproducir (WCAG 2.2.2). La portada se pinta
 * con `next/image` prioritario (LCP) y el `<video>` no la duplica.
 */
export function HeroVideo({ src, poster, alt, controls, objectPosition }: HeroVideoProps) {
  const style = objectPosition ? { objectPosition } : undefined;
  const video = useRef<HTMLVideoElement>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia(AUTOPLAY_QUERY).matches) return;
    setAutoPlay(true);
    const promise = video.current?.play();
    promise?.catch?.(() => setPlaying(false));
  }, []);

  function toggle() {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      const promise = element.play();
      promise?.catch?.(() => setPlaying(false));
    } else {
      element.pause();
    }
  }

  return (
    <>
      {poster ? (
        <Image src={poster} alt="" fill priority sizes="100vw" className="object-cover" style={style} unoptimized={/^https?:\/\//.test(poster)} />
      ) : null}
      <video
        ref={video}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          started || !poster ? "opacity-100" : "opacity-0"
        }`}
        style={style}
        src={src}
        preload="none"
        muted
        loop
        playsInline
        autoPlay={autoPlay}
        aria-label={alt}
        onPlay={() => setPlaying(true)}
        onPlaying={() => setStarted(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? controls.pause : controls.play}
        className="absolute top-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/50 backdrop-blur transition hover:bg-black/75 focus-visible:outline-white md:top-auto md:right-8 md:bottom-8"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    </>
  );
}
