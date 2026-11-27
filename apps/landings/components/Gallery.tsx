import Image from "next/image";
import type { GalleryImageView } from "../lib/view.js";
import { Section, type SectionTone } from "./Section.js";

export interface GalleryProps {
  title: string;
  images: GalleryImageView[];
  tone?: SectionTone;
}

/**
 * Clases de rejilla de cada imagen. La primera es la pieza grande (2×2). En
 * móvil (2 columnas) y escritorio (4 columnas) se ensanchan las últimas
 * piezas para que la última fila quede completa, sin huecos.
 */
export function galleryItemClasses(index: number, total: number): string {
  if (index === 0) return "col-span-2 row-span-2";
  const rest = total - 1;
  const pos = index - 1; // posición entre las piezas pequeñas
  const classes: string[] = [];
  // Móvil: rejilla de 2 columnas; si sobran impares, la última ocupa la fila.
  if (rest % 2 === 1 && pos === rest - 1) classes.push("col-span-2");
  // Escritorio: 4 huecos junto a la pieza grande y después filas de 4.
  const firstBlock = Math.min(rest, 4);
  if (pos < firstBlock) {
    if (firstBlock === 1) classes.push("md:col-span-2 md:row-span-2");
    else if (firstBlock === 2) classes.push("md:col-span-2");
    else if (firstBlock === 3 && pos === 2) classes.push("md:col-span-2");
    else classes.push("md:col-span-1");
  } else {
    const tail = (rest - 4) % 4;
    const tailStart = rest - tail;
    if (tail > 0 && pos >= tailStart) {
      if (tail === 1) classes.push("md:col-span-4");
      else if (tail === 2) classes.push("md:col-span-2");
      else if (tail === 3 && pos === rest - 1) classes.push("md:col-span-2");
      else classes.push("md:col-span-1");
    } else {
      classes.push("md:col-span-1");
    }
  }
  return classes.join(" ");
}

/** Galería en mosaico: una pieza grande y el resto en rejilla, con etiqueta IA por imagen si procede. */
export function Gallery({ title, images, tone }: GalleryProps) {
  return (
    <Section id="gallery" title={title} tone={tone}>
      <ul className="grid auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[12rem] md:auto-rows-[14rem] md:grid-cols-4 md:gap-4">
        {images.map((image, index) => (
          <li
            key={image.src}
            className={`group relative overflow-hidden rounded-2xl bg-slate-200 shadow-sm ${galleryItemClasses(index, images.length)}`}
          >
            <figure className="m-0 h-full w-full">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                loading="lazy"
                sizes={index === 0 ? "(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw" : "(min-width: 1152px) 280px, (min-width: 768px) 25vw, 50vw"}
                className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
                unoptimized={/^https?:\/\//.test(image.src)}
              />
              {image.aiLabel ? (
                <figcaption className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold text-white">
                  {image.aiLabel}
                </figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>
    </Section>
  );
}
