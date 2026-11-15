# 05 · Catálogo y servidor MCP

## Por qué

El inventario de una agencia receptiva suele vivir en PDFs, hojas de cálculo y WhatsApp. Ningún agente puede usarlo así. Convertirlo en datos estructurados es la base de todo:

- Las landings se generan desde el catálogo.
- El agente de calificación responde con datos reales, no inventados.
- El agente de propuestas arma itinerarios coherentes.
- El equipo de la agencia consulta su propio catálogo desde Claude.
- A futuro, el catálogo queda listo para protocolos de comercio agéntico.

## Modelo

### `catalog_tours/{tourId}`

| Campo | Notas |
| --- | --- |
| `tourId` | slug estable, p. ej. `galapagos-8d-crucero` en `ec-es` |
| `title`, `summary` | Objeto por idioma (`{ "es-ES": "..." }`); se publica en el `locale` del mercado de cada instancia |
| `regions` | Valores de la taxonomía del pack de destino (en `ec`: `galapagos` · `amazonia` · `andes` · `costa`) |
| `type` | `cruise` · `lodge` · `circuit` · `custom` |
| `durationDays` | |
| `difficulty` | `low` · `medium` · `high` |
| `itinerary[]` | `{ day, title, description, overnight }` |
| `includes[]`, `excludes[]` | |
| `bestMonths[]` | 1–12 |
| `priceGuidance` | `{ fromEurPerPerson, basis, validUntil, confirmedByAgency: false }` |
| `requirements[]` | Referencias a requisitos del pack de destino para el mercado de la instancia (pasaporte, tasas de zonas protegidas, vacunas recomendadas) |
| `media[]` | Solo material real de la agencia, con créditos |
| `status` | `draft` · `published` · `archived` |
| `sourceDoc` | Referencia al PDF original de la agencia |
| `updatedAt`, `reviewedBy` | |

### `catalog_tours/{tourId}/departures/{departureId}`

`{ date, seatsTotal, seatsAvailable, status, updatedAt }`. Al inicio se actualiza a mano o por hoja de cálculo; nunca se presenta al viajero como disponibilidad confirmada.

## Carga del catálogo (ingesta asistida por IA)

1. La agencia envía sus programas (PDF o Word).
2. Un script (`scripts/ingest-catalog`) usa Claude o Gemini para **extraer** el programa a JSON validado con el esquema Zod `Tour`.
3. El resultado queda en `status: draft`.
4. Una persona revisa y corrige en una vista simple (o en el JSON) y pasa a `published`.
5. Cualquier cambio de precio o requisitos exige `reviewedBy`.

## Servidor MCP

- SDK oficial de MCP para TypeScript, transporte **Streamable HTTP**.
- Desplegado en **Cloud Run** en la región de la instancia, lectura de Firestore con una cuenta de servicio de solo lectura sobre `catalog_*`.
- Autenticación: token por cliente (agente interno, equipo de la agencia). Sin acceso anónimo.

### Tools

```ts
search_tours({ region?, type?, month?, maxDays?, budgetPerPerson? }) -> TourSummary[]
get_tour({ tourId }) -> Tour
list_departures({ tourId, from?, to? }) -> Departure[]
get_travel_requirements({ tourIds }) -> Requirement[]
get_price_guidance({ tourId, pax, month }) -> { range, disclaimer }
```

Reglas de diseño:

- Las descripciones de cada tool explican **cuándo** usarla y qué **no** garantiza.
- Toda respuesta con precios incluye `disclaimer` y `confirmedByAgency: false`.
- Sin herramientas de escritura en el MCP público. Las acciones (crear lead, cambiar estado) son tools internas del backend.

### Recursos MCP

- `catalog://tours/{tourId}` → ficha en Markdown para contexto.
- `catalog://policies/sales` → reglas comerciales de la agencia (qué se puede prometer y qué no).

## Preparación para comercio agéntico

Protocolos como el Universal Commerce Protocol (Google) y el Agentic Commerce Protocol (OpenAI + Stripe) empiezan por alojamiento y retail. Para tours de varios días aún no aplican, pero:

- Mantener el catálogo como **ofertas estructuradas** (alineado con schema.org) reduce el trabajo futuro.
- No se implementa nada de estos protocolos hasta que exista un caso real para tours. Revisión trimestral.
