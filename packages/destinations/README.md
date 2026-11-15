# packages/destinations

Packs de **destino**: todo lo que depende del país donde opera la agencia y se realizan los viajes. Un pack por país (`ec`, `pe`, `co`…).

> Estado: pendiente de scaffolding. Primer pack: `ec`.

## Qué contiene un pack

| Clave | Ejemplo `ec` |
| --- | --- |
| `regions` | `galapagos`, `amazonia`, `andes`, `costa` (taxonomía para el catálogo y los filtros) |
| `localCurrency` | `USD` |
| `defaultAgencyTimezone` | `America/Guayaquil` |
| `seasonality` | Mejores meses por región |
| `entryRequirements` | Fuentes oficiales de requisitos de entrada **por mercado** (dependen de la nacionalidad del viajero) |
| `specialFees` | Tasas o permisos de zonas concretas (p. ej. ingreso a parques nacionales), con fuente y fecha de revisión |
| `safetyGuidance` | Política para hablar de seguridad: citar el aviso oficial del país emisor y no minimizar ni alarmar |
| `mediaGuidelines` | Recomendaciones de grabación propias del destino |

## Reglas

- Todo dato que pueda cambiar (requisitos, tasas) lleva `source` y `reviewedAt`. El agente cita la fuente y recomienda verificarla.
- Los requisitos se modelan por par destino × mercado, porque cambian según la nacionalidad del viajero.
