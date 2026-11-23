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

Los datos de las secciones (`itinerary`, `includes`, `bestSeason`, `priceGuidance`, `faq`) son opcionales: una sección incluida en `sections` pero sin datos no se renderiza. Los textos fijos de la interfaz (títulos de sección, «Día N», «Desde X por persona», etiqueta de medio generado con IA, botón de WhatsApp...) no están en el contenido ni en el código: salen de `marketPack.landingUi` de la configuración resuelta (ver [11-instancias-y-configuracion.md](11-instancias-y-configuracion.md#marketpack-packagesmarketsiso)).

## Rutas y borrador

- `/<slug>`: una landing publicada (`apps/landings/app/[slug]/page.tsx`), generada por `generateStaticParams` a partir de `content/landings/*.json`, con `dynamicParams = false` (cualquier otro slug devuelve 404).
- `/legal/<slug>`: una página legal (`apps/landings/app/legal/[slug]/page.tsx`) por cada entrada de `legalTexts.pages` del pack de mercado de la instancia (no de `content/landings/`).

Una landing con `draft: true` solo se incluye en `generateStaticParams` si la instancia completa está en `status: draft`; en cualquier otro estado queda excluida, como si no existiera. Mientras la instancia está en `draft`, la plantilla añade una banda de borrador visible y `noindex` en todas las páginas, para que un sitio de prueba no se indexe ni se confunda con el definitivo.

## Componentes

| Componente | Notas |
| --- | --- |
| `Hero` | Vídeo vertical real en móvil; nunca imágenes generadas que parezcan reales sin etiqueta |
| `Itinerary` | Día a día desde el catálogo |
| `PriceGuidance` | "Desde X" por persona, formateado con `Intl.NumberFormat` en el `locale` y la moneda del mercado, más el `priceDisclaimer` del pack |
| `Trust` | Número local del mercado, agencia registrada en el destino, reseñas reales enlazadas |
| `LeadForm` | Nombre, teléfono, email opcional, mes, personas, checkbox de consentimiento |
| `WhatsAppCTA` | Enlace `wa.me` con mensaje predefinido y código de campaña |
| `ConsentBanner` | Consent Mode v2; sin consentimiento no se carga el Pixel |

Los componentes viven en `apps/landings/components/` (Server Components sin estado). No leen configuración: `lib/view.ts` (`buildLandingView`) resuelve antes los textos de `marketPack.landingUi`, el precio con `Intl.NumberFormat`, el número con `libphonenumber-js` y el enlace `wa.me`, y descarta las secciones sin datos. La página renderiza el `Hero` y después las secciones en el orden de `sections`. Los estilos usan Tailwind CSS 4 (`app/globals.css`); el color de marca sale de `brand.primaryColor` (variable `--brand-primary`, utilidades `bg-brand`, `text-brand`, `border-brand`). `LeadForm` y `ConsentBanner` llegan en otros tickets.

## Tracking

1. Al cargar: leer UTMs, `fbclid` y `gclid`; guardarlos en `sessionStorage` y en una cookie first-party (solo con consentimiento de analítica).
2. Generar `eventId` (UUID) por envío de formulario.
3. Enviar `Lead` al Pixel en el cliente **y** a la Conversions API desde la Function con el **mismo `eventId`**. Meta deduplica.
4. Eventos de `dataLayer` estándar: ver [07-medicion.md](07-medicion.md).

## Datos estructurados (SEO y GEO)

Cada landing incluye JSON-LD generado desde el catálogo:

- `TouristTrip` con `itinerary`, `touristType` y `provider` (la agencia).
- `Offer` con `priceSpecification` marcado como orientativo y `availability` genérica.
- `FAQPage` con las preguntas visibles.
- `Organization` con los datos de contacto del socio en el mercado.

Además:

- Una página canónica por tour que actúe como **fuente de verdad** (lo que los asistentes de IA citarán).
- `sitemap.xml`, `robots.txt` y `llms.txt` con un índice de los tours.
- Contenido orientado a preguntas reales del mercado. En `ec-es`: "mejor época Galápagos", "cuánto cuesta viajar a Ecuador desde España", "vuelos directos Madrid Quito".

## Rendimiento

- LCP < 2,5 s en 4G. El vídeo del hero con `poster` y carga diferida.
- Imágenes con `next/image`, AVIF/WebP.
- Revisión con Lighthouse en CI para las landings activas.

## Páginas legales obligatorias

Las define el pack de mercado en `legalTexts.pages` (al menos una, slugs únicos en kebab-case), con textos revisados por un abogado de ese mercado. En mercados UE: privacidad, cookies y aviso legal. El texto del checkbox de consentimiento se versiona (`legalTexts.version`).

## Una instancia, un sitio

Cada instancia despliega su propio sitio de landings con su dominio y marca (`brand` en `instance.yaml`). El build recibe `INSTANCE=<id>` y falla si falta cualquier valor obligatorio de configuración.
