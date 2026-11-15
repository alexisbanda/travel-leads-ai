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
    "media": "/media/galapagos-hero.mp4"
  },
  "sections": ["itinerary", "includes", "bestSeason", "priceGuidance", "faq", "trust", "cta"],
  "faq": [
    { "q": "¿Cuál es la mejor época para ir?", "a": "..." },
    { "q": "¿Es seguro viajar a Ecuador?", "a": "..." }
  ],
  "cta": { "type": "whatsapp", "prefill": "Hola, me interesa Galápagos [GAL-01]" },
  "experiment": { "id": "hero-v2", "variant": "B" }
}
```

El código de campaña en el `prefill` (`[GAL-01]`) permite atribuir conversaciones de WhatsApp que empiezan en la landing.

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

Las define el pack de mercado (`legal.pages`), con textos revisados por un abogado de ese mercado. En mercados UE: privacidad, cookies y aviso legal. El texto del checkbox de consentimiento se versiona (`textVersion`).

## Una instancia, un sitio

Cada instancia despliega su propio sitio de landings con su dominio y marca (`brand` en `instance.yaml`). El build recibe `INSTANCE=<id>` y falla si falta cualquier valor obligatorio de configuración.
