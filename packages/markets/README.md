# packages/markets

Packs de **mercado emisor**: todo lo que depende del país donde están los viajeros. Un pack por país (`es`, `de`, `us`…), en TypeScript y validado con Zod.

> Estado: pendiente de scaffolding. Primer pack: `es`.

## Qué contiene un pack

| Clave | Ejemplo `es` |
| --- | --- |
| `locale` | `es-ES` |
| `currency` | `EUR` |
| `timezone` | `Europe/Madrid` |
| `phoneDefaultRegion` | `ES` |
| `legal.regime` | `EU_GDPR` |
| `legal.allowedRegions` | Regiones de GCP en Europa (**bloqueado**: la instancia no puede salirse) |
| `legal.cookieConsentRequired` | `true` |
| `legal.aiDisclosure` | Texto obligatorio de aviso de IA en el idioma del mercado (**bloqueado**) |
| `legal.travelSalesRule` | El socio no vende viajes combinados; la agencia contrata y cobra |
| `legal.pages` | Plantillas de privacidad, cookies y aviso legal (revisadas por abogado) |
| `agentTone` | Ajustes de idioma y tono para los prompts (variante de español, tuteo, longitud) |
| `travelAdvisorySource` | Organismo oficial de avisos de viaje del país emisor |
| `priceDisclaimer` | "Precio orientativo, sujeto a confirmación por la agencia" |

## Reglas

- Un pack nuevo requiere revisión legal del mercado antes de usarse en una instancia `pilot` o `active`.
- Los valores **bloqueados** no se pueden sobrescribir desde `instance.yaml`; la validación falla si se intenta.
- Solo aquí (y en `packages/destinations` e `instances/`) pueden aparecer valores propios de un país.
