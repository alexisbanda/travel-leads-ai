# packages/shared

Tipos y esquemas **Zod** compartidos entre landings, functions y el servidor MCP. Es la única fuente de verdad del modelo de datos.

> Estado: `LeadStatus` y los esquemas de configuración (`InstanceConfig`, `MarketPack`, `DestinationPack`) listos; el resto (`attribution`, `consent`, `catalog`, `events`) está pendiente.

## Contenido previsto

```
packages/shared/src/
├── lead.ts          # LeadSchema, LeadStatus, LeadSource
├── attribution.ts   # UTMs, fbclid, gclid, event_id
├── consent.ts       # Consentimiento RGPD
├── catalog.ts       # Tour, Departure, PriceGuidance
├── events.ts        # Taxonomía de eventos de medición
├── instance/
│   ├── primitives.ts        # Validadores comunes: país, moneda, idioma, zona horaria, secret:NOMBRE, E.164…
│   ├── instance-config.ts   # InstanceConfig (instances/<id>/instance.yaml)
│   ├── market-pack.ts       # MarketPack (packages/markets/<iso>)
│   ├── destination-pack.ts  # DestinationPack (packages/destinations/<iso>)
│   └── index.ts
└── index.ts
```

Regla: si un campo cambia aquí, se actualiza en el mismo PR [docs/02-modelo-de-datos.md](../../docs/02-modelo-de-datos.md).

## Esquemas de configuración

`InstanceConfig`, `MarketPack` y `DestinationPack` validan estructura y formato de cada capa por separado. País, moneda, idioma y zona horaria se validan por formato o con la API `Intl`, sin listas de países en el código. Las reglas que cruzan capas (región frente a mercado, claves bloqueadas, `scc` según adecuación) se aplican al resolver la configuración, no aquí.

Referencia campo a campo y regla de `draft`: [docs/11-instancias-y-configuracion.md](../../docs/11-instancias-y-configuracion.md#esquemas-de-configuración). Si cambias un campo de estos esquemas, actualiza ese documento y `instances/_template/instance.yaml` en el mismo PR.

```ts
import { InstanceConfig } from "@tla/shared";

const result = InstanceConfig.safeParse(parsedYaml);
if (!result.success) console.error(result.error.issues); // cada issue trae el path del campo
```
