import Image from "next/image";
import type { HeroView } from "../lib/view.js";

export type HeroProps = HeroView;

/** Bloque principal: titular, subtítulo y vídeo o imagen (con etiqueta IA si procede). */
export function Hero({ headline, subheadline, media }: HeroProps) {
  return (
    <header className="bg-gray-950 text-white">
      {media ? (
        <figure className="relative aspect-video w-full overflow-hidden bg-gray-900">
          {media.kind === "video" ? (
            <video
              className="h-full w-full object-cover"
              src={media.src}
              poster={media.poster}
              preload="none"
              muted
              playsInline
              controls
              aria-label={media.alt}
            />
          ) : (
            <Image
              src={media.src}
              alt={media.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              unoptimized={/^https?:\/\//.test(media.src)}
            />
          )}
          {media.aiLabel ? (
            <figcaption className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-xs font-medium text-white">
              {media.aiLabel}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{headline}</h1>
        {subheadline ? <p className="mt-3 text-lg text-gray-100">{subheadline}</p> : null}
      </div>
    </header>
  );
}
