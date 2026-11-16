# packages/destinations

Packs de **destino**: todo lo que depende del país donde opera la agencia y se realizan los viajes. Un pack por país (`ec`, `pe`, `co`…), en TypeScript y validado con el esquema `DestinationPack` de `@tla/shared`. Paquete pnpm `@tla/destinations`.

> Estado: primer pack `ec` (Ecuador).

## Estructura

```
packages/destinations/
├── index.ts          # registro destinationPacks, getDestinationPack()
└── ec/
    ├── pack.ts       # export const ec = DestinationPack.parse({...})
    └── pack.test.ts
```

```ts
import { getDestinationPack } from "@tla/destinations";

const destination = getDestinationPack(instance.destination.country); // undefined si no hay pack
```

## Qué contiene un pack

Referencia completa de tipos y validación: [docs/11 · `DestinationPack`](../../docs/11-instancias-y-configuracion.md).

| Clave | Valor en `ec` |
| --- | --- |
| `country` | `EC` |
| `currency` | `USD` |
| `timezone` | `America/Guayaquil` (zona horaria por defecto de la agencia receptiva) |
| `regions` | Taxonomía de regiones turísticas para clasificar tours y filtros: `galapagos`, `amazonia`, `andes`, `costa` |
| `seasons` | Temporadas con sus meses y, opcionalmente, las regiones a las que aplican (p. ej. temporada seca de Sierra y Amazonía, mejor época para Galápagos) |
| `markets` | Información por mercado emisor, indexada por código de país en mayúsculas (`ES`): `entryRequirements`, `travelAdvice` y `adequacyDecision` |
| `markets.<ISO>.entryRequirements` | Fuentes oficiales (`label` + `url` https) de requisitos de entrada al destino para viajeros de ese mercado |
| `markets.<ISO>.travelAdvice` | Fuentes oficiales (`label` + `url` https) de avisos de viaje de ese mercado sobre el destino |
| `markets.<ISO>.adequacyDecision` | Si el destino tiene decisión de adecuación de protección de datos de la UE para ese mercado (en `ec`/`ES`: `false`) |

Claves del borrador inicial de este README que **no están en el esquema actual** y quedan pendientes, fuera de alcance de este pack:

- `specialFees` (tasas o permisos de zonas concretas, con fuente y fecha de revisión).
- `safetyGuidance` (política para hablar de seguridad).
- `mediaGuidelines` (recomendaciones de grabación propias del destino).

Si se necesitan, se añaden primero al esquema `DestinationPack` de `@tla/shared` (con su valor por defecto), no directamente en el pack.

## Cómo añadir un pack

1. Documenta el destino en `docs/11-instancias-y-configuracion.md` si introduce una clave nueva de esquema.
2. Crea `packages/destinations/<iso>/pack.ts` con `export const <iso> = DestinationPack.parse({...})` y su `pack.test.ts`.
3. Regístralo en `index.ts` bajo el código ISO en mayúsculas (`destinationPacks`) y añade `<iso>` al `include` de `tsconfig.json`.
4. Ejecuta `pnpm --filter @tla/destinations test` y `pnpm instance:validate`.

## Reglas

- Los requisitos de entrada y los avisos de viaje se modelan por par destino × mercado, porque dependen de la nacionalidad del viajero.
- Toda fuente de `entryRequirements` y `travelAdvice` es un organismo oficial (ministerio de exteriores del mercado, o autoridad de migración/cancillería del destino), enlazada por `https`.
- Solo aquí (y en `packages/markets` e `instances/`) pueden aparecer valores propios de un país.
