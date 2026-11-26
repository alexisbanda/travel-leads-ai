# 04 · Landings

Una sola plantilla Next.js genera muchas landings a partir de contenido. Objetivo: que el mensaje de cada anuncio coincida con el de su landing, y poder lanzar variantes en minutos.

## Modelo de contenido

`instances/<id>/content/landings/<slug>.json`

El contenido pertenece a la instancia, en el idioma de su mercado. La plantilla toma de la configuración resuelta la marca, el número de WhatsApp, la moneda, el formato de precios, las páginas legales y los IDs de tracking. Ejemplo de la instancia `ec-es`:

```json
{
  "slug": "galapagos-desde-espana",
  "segment": "adventure",
  "tourIds": ["galapagos-8d-crucero"],
  "seo": {
    "title": "Galápagos desde España: viaje de 8 días con guía local",
    "description": "Itinerario, mejor época y precio orientativo. Asesoramiento por WhatsApp con número español."
  },
  "hero": {
    "headline": "Galápagos como lo viven los locales",
    "subheadline": "8 días, grupos pequeños y asesoramiento en España",
    "media": {
      "src": "/media/galapagos-hero.mp4",
      "kind": "video",
      "poster": "/media/galapagos-hero.jpg",
      "alt": "Lobo marino en una playa de Galápagos",
      "aiGenerated": false
    }
  },
  "sections": ["itinerary", "includes", "bestSeason", "priceGuidance", "faq", "trust", "cta"],
  "itinerary": [
    { "day": 1, "title": "Llegada a Quito", "description": "..." },
    { "day": 2, "title": "Vuelo a Galápagos", "description": "..." }
  ],
  "includes": {
    "included": ["Alojamiento", "Guía naturalista"],
    "notIncluded": ["Vuelos internacionales"]
  },
  "bestSeason": { "summary": "..." },
  "priceGuidance": { "from": 2490 },
  "faq": [
    { "q": "¿Cuál es la mejor época para ir?", "a": "..." },
    { "q": "¿Es seguro viajar a Ecuador?", "a": "..." }
  ],
  "cta": { "type": "whatsapp", "prefill": "Hola, me interesa Galápagos [GAL-01]" },
  "experiment": { "id": "hero-v2", "variant": "B" }
}
```

El código de campaña en el `prefill` (`[GAL-01]`) permite atribuir conversaciones de WhatsApp que empiezan en la landing.

### Campos de `LandingContent`

Esquema Zod en `packages/shared/src/landing/landing-content.ts`, exportado como `LandingContent` desde `@tla/shared`. `pnpm instance:validate` lo aplica a cada archivo de `content/landings/*.json`: el `slug` debe coincidir con el nombre del archivo (sin extensión) y no puede chocar con un slug de `legalTexts.pages` del pack de mercado.

| Campo | Tipo y validación |
| --- | --- |
| `slug` | Kebab-case (minúsculas, dígitos y `-`); debe coincidir con el nombre del archivo |
| `segment` | Texto no vacío; coherente con los `segments` de la instancia |
| `tourIds` | Lista no vacía de IDs del catálogo |
| `seo` | `{ title, description }`, ambos obligatorios |
| `hero` | `{ headline, subheadline?, media? }` |
| `hero.media` | Opcional: `{ src, kind: "video" \| "image", poster?, alt, aiGenerated }`. `aiGenerated` es booleano, por defecto `false`; si es `true`, la plantilla muestra junto al medio la etiqueta `landingUi.aiImageLabel` del pack de mercado |
| `sections` | Lista no vacía de `itinerary` · `includes` · `bestSeason` · `priceGuidance` · `faq` · `trust` · `cta`, en el orden en que se renderizan |
| `itinerary` | Opcional: lista no vacía de `{ day, title, description }`; `day` es un entero ≥ 1 |
| `includes` | Opcional: `{ included, notIncluded? }`; `included` es una lista no vacía de textos |
| `bestSeason` | Opcional: `{ summary }` |
| `priceGuidance` | Opcional: `{ from }`, número positivo. Precio **orientativo** por persona en la moneda del mercado; no es una oferta ni confirma disponibilidad, y se muestra siempre con el `priceDisclaimer` del pack |
| `faq` | Opcional: lista de `{ q, a }` |
| `cta` | `{ type: "whatsapp" \| "form", prefill? }` |
| `experiment` | Opcional: `{ id, variant }`, referencia a un experimento A/B en curso |
| `draft` | Booleano, por defecto `false`. Ver [Borrador](#borrador) |

Los datos de las secciones (`itinerary`, `includes`, `bestSeason`, `priceGuidance`, `faq`) son opcionales: una sección incluida en `sections` pero sin datos no se renderiza. Los textos fijos de la interfaz (títulos de sección, «Día N», «Desde X por persona», etiqueta de medio generado con IA, botón de WhatsApp, etiquetas, errores y pantalla de gracias del formulario de lead en `landingUi.form`...) no están en el contenido ni en el código: salen de `marketPack.landingUi` de la configuración resuelta (ver [11-instancias-y-configuracion.md](11-instancias-y-configuracion.md#marketpack-packagesmarketsiso)).

## Rutas y borrador

- `/<slug>`: una landing publicada (`apps/landings/app/[slug]/page.tsx`), generada por `generateStaticParams` a partir de `content/landings/*.json`, con `dynamicParams = false` (cualquier otro slug devuelve 404).
- `/legal/<slug>`: una página legal (`apps/landings/app/legal/[slug]/page.tsx`) por cada entrada de `legalTexts.pages` del pack de mercado de la instancia (no de `content/landings/`).

Una landing con `draft: true` solo se incluye en `generateStaticParams` si la instancia completa está en `status: draft`; en cualquier otro estado queda excluida, como si no existiera. Mientras la instancia está en `draft`, la plantilla añade una banda de borrador visible y `noindex` en todas las páginas, con el texto de `landingUi.draftNotice` junto al icono ⚠, para que un sitio de prueba no se indexe ni se confunda con el definitivo.

## Componentes

| Componente | Notas |
| --- | --- |
| `Header` | Logo de `brand.logo` con `alt` igual al nombre de marca; sin logo, muestra `brand.displayName`; si ambos están vacíos, el nombre de la instancia |
| `Footer` | Un enlace a `/legal/<slug>` por cada entrada de `legalTexts.pages`, con su `title`; y la razón social de `partner.legalName` y `agency.legalName` que no estén vacías |
| `Hero` | Vídeo vertical real en móvil; nunca imágenes generadas que parezcan reales sin etiqueta |
| `Itinerary` | Día a día desde el catálogo |
| `PriceGuidance` | "Desde X" por persona, formateado con `Intl.NumberFormat` en el `locale` y la moneda del mercado, más el `priceDisclaimer` del pack |
| `Trust` | Número local del mercado, agencia registrada en el destino, reseñas reales enlazadas |
| `LeadForm` | Con `cta.type: "form"`. Nombre, teléfono (validado con `phoneDefaultRegion`), email opcional, mes, personas y consentimientos de `legalTexts` (contacto obligatorio, marketing opcional). Envía a `ingestLandingLead` con App Check y muestra la pantalla de gracias con enlace a WhatsApp. Textos en `landingUi.form`; detalles en `apps/landings/README.md` |
| `WhatsAppCTA` | Enlace `wa.me` con mensaje predefinido y código de campaña |
| `ConsentBanner` | Consent Mode v2; sin consentimiento no se carga el Pixel |

Los componentes viven en `apps/landings/components/` (Server Components sin estado). No leen configuración: `lib/view.ts` (`buildLandingView`) resuelve antes los textos de `marketPack.landingUi`, el precio con `Intl.NumberFormat`, el número con `libphonenumber-js` y el enlace `wa.me`, y descarta las secciones sin datos. La página renderiza el `Hero` y después las secciones en el orden de `sections`. Los estilos usan Tailwind CSS 4 (`app/globals.css`); el color de marca sale de `brand.primaryColor` (variable `--brand-primary`, utilidades `bg-brand`, `text-brand`, `border-brand`). `LeadForm` y `ConsentBanner` llegan en otros tickets.

## Tracking

1. Al cargar: leer UTMs, `fbclid` y `gclid`; guardarlos en `sessionStorage` y en una cookie first-party (solo con consentimiento de analítica).
2. Generar `eventId` (UUID) por envío de formulario.
3. Enviar `Lead` al Pixel en el cliente **y** a la Conversions API desde la Function con el **mismo `eventId`**. Meta deduplica.
4. Eventos de `dataLayer` estándar: ver [07-medicion.md](07-medicion.md).

## Datos estructurados (SEO y GEO)

Cada landing (`app/[slug]/page.tsx`) incluye un grafo JSON-LD tipado con `schema-dts`, generado en `apps/landings/lib/structured-data.ts` (`buildLandingGraph`, probado en `structured-data.test.ts`) a partir de su contenido, la configuración resuelta y la vista ya construida (`buildLandingView`, para no duplicar qué secciones se ven):

- `TouristTrip`: `name`/`description` de `seo`, `url` (la canónica), `itinerary` si la landing tiene días, y `provider` (la `Organization`).
- `Offer`: **solo** orientativo. Lleva `priceSpecification` (`PriceSpecification` con `minPrice: priceGuidance.from` y `priceCurrency`, la moneda del pack de mercado) y `description` con el `priceDisclaimer` del pack. Nunca lleva `price` ni `availability` (regla 2 de `AGENTS.md`: no confirmamos precio ni disponibilidad). Si la landing no tiene `priceGuidance`, no hay `Offer`.
- `FAQPage`: solo con las preguntas que la página muestra de verdad (si `faq` no está en `sections` o no tiene elementos, no hay `FAQPage`).
- `Organization`: `name` (`brand.displayName`), `url` (`https://<brand.domain>`, omitido si está vacío) y `legalName` (`partner.legalName`).

El `<script type="application/ld+json">` se serializa escapando `<` para evitar inyección HTML. `generateMetadata` añade `alternates.canonical` con la URL canónica (`apps/landings/lib/structured-data.ts`, `canonicalUrl`): `https://<brand.domain>/<slug>` con dominio, o `/<slug>` en `draft` sin dominio.

Además (lógica en `apps/landings/lib/seo-index.ts`, probada en `seo-index.test.ts`):

- Una página canónica por tour que actúe como **fuente de verdad** (lo que los asistentes de IA citarán).
- `app/robots.ts`: si la instancia está en `status: draft` o `brand.domain` está vacío, `Disallow: /` sin línea `Sitemap`; si no, `Allow: /` y `Sitemap: https://<domain>/sitemap.xml`.
- `app/sitemap.xml/route.ts`: una URL por landing publicada. En `draft` o sin dominio responde **404** (no se publica). Es un route handler, no la convención `app/sitemap.ts`, porque esa convención siempre sirve XML y no permite devolver 404 condicionalmente; el handler sigue siendo estático (`dynamic = "force-static"`, la configuración resuelta no cambia en runtime).
- `app/llms.txt/route.ts`: formato llms.txt (`# <brand.displayName>` y una lista `- [<título>](<url canónica>): <resumen de seo.description>` por landing publicada). Se sirve también en `draft`, pero nunca lista landings `draft: true`.
- En los tres casos, "landings publicadas" excluye las `draft: true` **incluso** cuando la instancia entera está en `draft` (a diferencia de las páginas, que sí publican el contenido `draft` de una instancia en `draft`).
- Contenido orientado a preguntas reales del mercado. En `ec-es`: "mejor época Galápagos", "cuánto cuesta viajar a Ecuador desde España", "vuelos directos Madrid Quito".

## Rendimiento

- LCP < 2,5 s en 4G. El vídeo del hero con `poster` y carga diferida.
- Imágenes con `next/image`, formatos modernos (`images.formats: ["image/avif", "image/webp"]` en `apps/landings/next.config.ts`). `eslint.config.mjs` registra `@next/eslint-plugin-next` sobre `apps/landings` y marca `<img>` como error (`@next/next/no-img-element`) para forzar `next/image`.
- Presupuesto de rendimiento con Lighthouse CI (`apps/landings/lighthouserc.json`): perfil móvil, 3 ejecuciones por URL y mediana (`aggregationMethod: "median-run"`) sobre las landings de ejemplo de `ec-es` (`/ejemplo` y `/ejemplo-form`). Falla (`error`) si no se cumple:
  - `largest-contentful-paint` < 2500 ms.
  - `cumulative-layout-shift` < 0,1.
  - `categories:performance` ≥ 0,90.
- El job `lighthouse` de `.github/workflows/ci.yml` construye la instancia `ec-es`, compila `apps/landings` y ejecuta `pnpm --filter landings lhci` (`lhci autorun`); sube los informes (`apps/landings/.lighthouseci`) como artefacto aunque falle.
- En local: `pnpm instance:build ec-es && pnpm --filter landings build && pnpm --filter landings lhci`. Si LHCI no encuentra Chrome, exporta `CHROME_PATH` (p. ej. `CHROME_PATH=/usr/bin/google-chrome`). Los informes (HTML y JSON) quedan en `apps/landings/.lighthouseci/` (no se versiona).

## Páginas legales obligatorias

Las define el pack de mercado en `legalTexts.pages` (al menos una, slugs únicos en kebab-case), con textos revisados por un abogado de ese mercado. En mercados UE: privacidad, cookies y aviso legal. El texto del checkbox de consentimiento se versiona (`legalTexts.version`). Todas comparten el mismo layout (`Header`, `Footer` y un ancho de lectura fijo). El aviso de privacidad del formulario (`LeadForm`) enlaza a `/legal/<legalTexts.privacyPageSlug>`.

## Medios

Los medios propios de la instancia (fotos y vídeo del héroe, logo de marca) viven en `instances/<id>/content/media/` y se referencian con rutas `/media/<ruta>` (`hero.media.src`, `hero.media.poster`, `brand.logo`). El build de landings los copia a `apps/landings/public/media/` (no se versiona). Fuera de `draft`, un medio referenciado que no existe hace fallar el build; en `draft`, solo avisa por consola y el `Hero` se pinta sin medio. Detalle completo en [docs/11-instancias-y-configuracion.md](11-instancias-y-configuracion.md#medios).

## Una instancia, un sitio

Cada instancia despliega su propio sitio de landings con su dominio y marca (`brand` en `instance.yaml`). El build recibe `INSTANCE=<id>` y falla si falta cualquier valor obligatorio de configuración.
