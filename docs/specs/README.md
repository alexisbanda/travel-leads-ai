# Specs

Los flujos con varias piezas (p. ej. webhook → inbox → lead → tareas) empiezan aquí: copia `_plantilla.md` como `NNN-nombre-corto.md` y abre un PR solo con la spec antes de implementar. Para tareas acotadas a un componente, el issue de Ticket Studio (secciones `## Historia` y `## Especificación` con criterios de aceptación) cuenta como spec y no necesita un documento aparte.

| Spec | Título | Estado |
| --- | --- | --- |
| [001](001-ingesta-lead-landing.md) | Ingesta de leads desde landing | Borrador |
| [002](002-prueba-punta-a-punta.md) | Prueba de punta a punta antes de lanzar | Aprobada |

Próximas: `onLeadCreated` (orquestación), webhook de Meta Lead Ads, webhook de WhatsApp, `slaWatchdog`, plantilla de landings, agente de calificación, ingesta del catálogo.
