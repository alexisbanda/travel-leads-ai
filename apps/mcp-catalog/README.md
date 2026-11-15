# apps/mcp-catalog

Servidor **MCP** (Model Context Protocol) que expone el catálogo de la agencia a agentes de IA. Escrito en TypeScript con el SDK oficial de MCP y desplegado en Cloud Run (HTTP).

> Estado: fase 2 del roadmap. Depende de que el catálogo esté cargado en Firestore.

## Consumidores

1. El agente de calificación de WhatsApp (`functions/`).
2. El agente generador de propuestas.
3. El equipo de la agencia desde Claude (conector personalizado).
4. A futuro: agentes externos (con autenticación y solo datos públicos).

## Herramientas previstas

| Tool | Descripción | Datos |
| --- | --- | --- |
| `search_tours` | Busca tours por región, duración, tipo, mes y presupuesto orientativo | Públicos |
| `get_tour` | Ficha completa de un tour: itinerario, incluye, no incluye, requisitos | Públicos |
| `list_departures` | Próximas salidas con cupos disponibles | Públicos |
| `get_travel_requirements` | Requisitos de entrada, vacunas recomendadas, Galápagos | Públicos |
| `get_price_guidance` | Rango de precio orientativo **sin confirmar** | Internos |

Documentación completa: [docs/05-catalogo-y-mcp.md](../../docs/05-catalogo-y-mcp.md)
