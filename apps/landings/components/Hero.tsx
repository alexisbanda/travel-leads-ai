import Image from "next/image";
import type { HeroView } from "../lib/view.js";
import { HeroVideo } from "./HeroVideo.js";
import { ArrowRightIcon, SparkIcon } from "./icons.js";
import { containerClass } from "./Section.js";

export type HeroProps = HeroView;

/** Id del hero: la barra fija de contacto en móvil aparece al dejarlo atrás. */
export const HERO_ID = "hero";

/**
 * Bloque principal. En escritorio, a pantalla casi completa con el medio de
 * fondo bajo un degradado oscuro; en móvil, el medio arriba (sin texto
 * encima, para que se vea el motivo) fundido con el bloque de texto. Titular,
 * subtítulo, chips de `highlights` y botón hacia el contacto; etiqueta IA y
 * control del vídeo si proceden.
 */
export function Hero({ headline, subheadline, media, highlights, cta }: HeroProps) {
  const style = media?.objectPosition ? { objectPosition: media.objectPosition } : undefined;
  return (
    <header
      id={HERO_ID}
      className="relative isolate overflow-hidden bg-brand-deep text-white md:flex md:min-h-[86vh] md:items-end"
    >
      {media ? (
        <figure className="relative m-0 aspect-[4/3] w-full md:absolute md:inset-0 md:aspect-auto md:h-full">
          {media.kind === "video" ? (
            <HeroVideo
              src={media.src}
              alt={media.alt}
              {...(media.poster !== undefined ? { poster: media.poster } : {})}
              {...(media.objectPosition !== undefined ? { objectPosition: media.objectPosition } : {})}
              controls={media.controls ?? { play: "", pause: "" }}
            />
          ) : (
            <Image
              src={media.src}
              alt={media.alt}
              fill
              priority
              fetchPriority="high"
              sizes="100vw"
              quality={65}
              className="object-cover"
              style={style}
              unoptimized={/^https?:\/\//.test(media.src)}
            />
          )}
          {/* Móvil: fundido del medio con el bloque de texto. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-brand-deep to-transparent md:hidden"
          />
          {media.aiLabel ? (
            <figcaption className="absolute top-4 left-4 z-10 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white md:top-6 md:right-8 md:left-auto">
              {media.aiLabel}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-brand)_0%,transparent_60%)] opacity-70"
        />
      )}
      {media ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
          <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-black/45 to-transparent" />
        </div>
      ) : null}

      <div className={`${containerClass} relative pb-12 md:pt-40 md:pb-24 ${media ? "-mt-14 md:mt-0" : "pt-20"}`}>
        <div className="max-w-3xl">
          <h1 className="font-display text-[2.25rem] leading-[1.06] font-extrabold tracking-tight text-balance [text-shadow:0_2px_16px_rgb(0_0_0/0.35)] sm:text-6xl lg:text-7xl">
            {headline}
          </h1>
          {subheadline ? (
            <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-white/95 sm:mt-5 sm:text-xl">
              {subheadline}
            </p>
          ) : null}
          {highlights?.length ? (
            <ul className="mt-6 flex flex-wrap gap-2 sm:mt-7 sm:gap-2.5">
              {highlights.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/35 backdrop-blur-md sm:px-4 sm:py-2"
                >
                  <SparkIcon className="h-4 w-4 text-white" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {cta ? (
            <a
              href={cta.href}
              className="group mt-8 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full bg-brand px-8 py-4 text-lg font-bold text-white shadow-xl shadow-black/30 transition hover:bg-brand-dark focus-visible:outline-white sm:mt-9 sm:inline-flex sm:w-auto"
            >
              {cta.label}
              <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
