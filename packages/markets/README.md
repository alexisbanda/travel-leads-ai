# packages/markets

Packs de **mercado emisor**: todo lo que depende del país donde están los viajeros. Un pack por país (`es`, `de`, `us`…), en TypeScript y validado con el esquema `MarketPack` de `@tla/shared`. Paquete pnpm `@tla/markets`.

> Estado: primer pack `es` (España) con textos legales y aviso de IA en **borrador** (`version: draft`), pendientes de revisión legal.

## Estructura

```
packages/markets/
├── index.ts          # registro marketPacks, getMarketPack(), AI_DISCLOSURE_BRAND_PLACEHOLDER
└── es/
    ├── pack.ts       # export const es = MarketPack.parse({...})
    └── pack.test.ts
```

```ts
import { getMarketPack } from "@tla/markets";

const market = getMarketPack(instance.market.country); // undefined si no hay pack
```

## Qué contiene un pack

Referencia completa de tipos y validación: [docs/11 · `MarketPack`](../../docs/11-instancias-y-configuracion.md#marketpack-packagesmarketsiso).

| Clave                                  | Valor en `es`                                                                                                                                                                                                                                                    | Bloqueada en `es`                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `country`                              | `ES`                                                                                                                                                                                                                                                             | —                                   |
| `locale`                               | `es-ES`                                                                                                                                                                                                                                                          | no                                  |
| `currency`                             | `EUR`                                                                                                                                                                                                                                                            | no                                  |
| `timezone`                             | `Europe/Madrid`                                                                                                                                                                                                                                                  | no                                  |
| `phoneDefaultRegion`                   | `ES`                                                                                                                                                                                                                                                             | no                                  |
| `businessHours`                        | 09:00–21:00, lunes a sábado (`days: [1…6]`)                                                                                                                                                                                                                      | no (la instancia ajusta su horario) |
| `legalRegime`                          | `gdpr`                                                                                                                                                                                                                                                           | sí                                  |
| `dataRegions`                          | Regiones de Google Cloud en Estados de la UE: `europe-southwest1`, `europe-west1`, `europe-west3`, `europe-west4`, `europe-west8`, `europe-west9`, `europe-west10`, `europe-west12`, `europe-north1`, `europe-north2`, `europe-central2` (sin Londres ni Zúrich) | sí                                  |
| `bigqueryLocation`                     | `EU`                                                                                                                                                                                                                                                             | sí                                  |
| `dataRetentionMonths`                  | `24` (por defecto; la instancia puede ajustarlo)                                                                                                                                                                                                                 | no                                  |
| `internationalTransferWithoutAdequacy` | `scc`                                                                                                                                                                                                                                                            | sí                                  |
| `aiDisclosure`                         | «Hola, soy un asistente de IA de {brand}…» (`version: draft`)                                                                                                                                                                                                    | sí                                  |
| `legalTexts`                           | Privacidad, consentimiento comercial, marketing y banner de cookies (`version: draft`)                                                                                                                                                                           | sí                                  |
| `priceDisclaimer`                      | «Precio orientativo, sujeto a confirmación por la agencia. No es una oferta ni una reserva.»                                                                                                                                                                     | sí                                  |
| `agentTone`                            | Español de España, tuteo cercano, 2–4 frases y una pregunta por mensaje                                                                                                                                                                                          | no                                  |
| `locked`                               | Lista de claves bloqueadas (columna derecha)                                                                                                                                                                                                                     | —                                   |

### Marcador de marca del aviso de IA

`aiDisclosure.text` puede llevar el marcador `{brand}` (constante `AI_DISCLOSURE_BRAND_PLACEHOLDER`). Al resolver la configuración se sustituye por `brand.displayName` de la instancia. El resto del texto no se puede cambiar desde la instancia.

## Bloqueos

Las claves de `locked` no se pueden sobrescribir desde `instance.yaml`. `findLockedOverrides(market, instance)` de `@tla/shared` devuelve la lista de violaciones (vacía si la instancia respeta el pack):

| Clave bloqueada                                                                                                     | Campo de la instancia comprobado | Regla                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `dataRegions`                                                                                                       | `infra.region`                   | Debe estar en la lista                                                                       |
| `bigqueryLocation`                                                                                                  | `infra.bigqueryLocation`         | Debe ser igual                                                                               |
| `locale`, `currency`, `timezone`, `phoneDefaultRegion`, `businessHours`                                             | `market.*`                       | Si la instancia lo trae, debe ser igual (en `businessHours`, los días se comparan sin orden) |
| `dataRetentionMonths`                                                                                               | `compliance.dataRetentionMonths` | Debe ser igual                                                                               |
| `legalRegime`, `internationalTransferWithoutAdequacy`, `aiDisclosure`, `legalTexts`, `priceDisclaimer`, `agentTone` | —                                | `InstanceConfig` no tiene campo para ellos y es estricto: no se pueden sobrescribir          |

Un valor vacío (`""`, instancia en `draft`) cuenta como «no establecido», no como sobrescritura.

## Cómo añadir un pack

1. Documenta el mercado en [docs/08](../../docs/08-seguridad-y-cumplimiento.md#otros-mercados) (base legal, región de datos, cookies, venta de viajes, transparencia de IA).
2. Crea `packages/markets/<iso>/pack.ts` con `export const <iso> = MarketPack.parse({...})` y su `pack.test.ts`.
3. Regístralo en `index.ts` bajo el código ISO en mayúsculas (`marketPacks`) y añade `<iso>` al `include` de `tsconfig.json`.
4. Ejecuta `pnpm --filter @tla/markets test` y `pnpm instance:validate`.

## Reglas

- Un pack nuevo requiere revisión legal del mercado antes de usarse en una instancia `pilot` o `active`; mientras tanto, sus textos llevan `version: draft`.
- Los valores **bloqueados** no se pueden sobrescribir desde `instance.yaml`; la validación falla si se intenta.
- Solo aquí (y en `packages/destinations` e `instances/`) pueden aparecer valores propios de un país.
