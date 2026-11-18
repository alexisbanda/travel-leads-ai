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
│   ├── locks.ts             # findLockedOverrides: claves bloqueadas del pack frente a la instancia
│   ├── rules.ts             # validateInstanceRules: reglas cruzadas instancia × packs
│   └── index.ts
└── index.ts
```

Regla: si un campo cambia aquí, se actualiza en el mismo PR [docs/02-modelo-de-datos.md](../../docs/02-modelo-de-datos.md).

## Esquemas de configuración

`InstanceConfig`, `MarketPack` y `DestinationPack` validan estructura y formato de cada capa por separado. País, moneda, idioma y zona horaria se validan por formato o con la API `Intl`, sin listas de países en el código. Las reglas que cruzan capas (región frente a mercado, claves bloqueadas, `scc` según adecuación) no están en los esquemas: las aplica `validateInstanceRules` (ver [Reglas cruzadas](#reglas-cruzadas)).

Referencia campo a campo y regla de `draft`: [docs/11-instancias-y-configuracion.md](../../docs/11-instancias-y-configuracion.md#esquemas-de-configuración). Si cambias un campo de estos esquemas, actualiza ese documento y `instances/_template/instance.yaml` en el mismo PR.

```ts
import { InstanceConfig } from "@tla/shared";

const result = InstanceConfig.safeParse(parsedYaml);
if (!result.success) console.error(result.error.issues); // cada issue trae el path del campo
```

## Claves bloqueadas

`findLockedOverrides(market, instance)` (`src/instance/locks.ts`) es una función pura que devuelve un `LockedOverride[]` (`{ key, path, expected, actual, message }`) con cada campo de la instancia que sobrescribe una clave de `market.locked`. Lista vacía = la instancia respeta el pack. Los valores vacíos (`""`) de una instancia en `draft` no cuentan como sobrescritura. Mapeo de claves a campos: [docs/11 · Claves bloqueadas](../../docs/11-instancias-y-configuracion.md#claves-bloqueadas).

```ts
import { findLockedOverrides } from "@tla/shared";
import { getMarketPack } from "@tla/markets";

const market = getMarketPack(instance.market.country);
const overrides = market ? findLockedOverrides(market, instance) : [];
```

## Reglas cruzadas

`validateInstanceRules(instance, { market, destination })` (`src/instance/rules.ts`) es una función pura que cruza una instancia ya validada con sus packs y devuelve un `RuleIssue[]` (`{ rule, path, message }`); `rule` es un `RuleId`: `pack-missing`, `destination-market-missing`, `data-region`, `locked-override`, `international-transfer`, `ai-disclosure` o `legal-texts-draft`. Los mensajes se construyen con los datos de los packs, nunca con valores fijos. Lista de reglas y precedencia: [docs/11 · Validación](../../docs/11-instancias-y-configuracion.md#validación). El comando `pnpm instance:validate` (`packages/instance-cli`) la usa con los registros de `@tla/markets` y `@tla/destinations`.
