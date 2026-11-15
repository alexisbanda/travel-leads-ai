# packages/shared

Tipos y esquemas **Zod** compartidos entre landings, functions y el servidor MCP. Es la única fuente de verdad del modelo de datos.

> Estado: pendiente de scaffolding (semana 1 del roadmap).

## Contenido previsto

```
packages/shared/src/
├── lead.ts          # LeadSchema, LeadStatus, LeadSource
├── attribution.ts   # UTMs, fbclid, gclid, event_id
├── consent.ts       # Consentimiento RGPD
├── catalog.ts       # Tour, Departure, PriceGuidance
├── events.ts        # Taxonomía de eventos de medición
├── instance.ts      # InstanceConfig, MarketPack, DestinationPack y reglas cruzadas
└── index.ts
```

Regla: si un campo cambia aquí, se actualiza en el mismo PR [docs/02-modelo-de-datos.md](../../docs/02-modelo-de-datos.md).
