# 00 · Visión

## Problema

Las agencias receptivas de destinos como Ecuador, Perú o Colombia dependen de intermediarios (OTAs, mayoristas) o de socios puntuales para llegar a viajeros de otros países. En cada mercado emisor les falta presencia local, confianza (idioma, número de teléfono, horario) y un sistema que mida qué inversión genera ventas.

## Propuesta

Un motor reutilizable que permite a un **socio de marketing en un mercado emisor** captar y calificar viajeros para una **agencia receptiva**:

- Contenido y campañas pensadas para el viajero de ese mercado.
- Primer contacto con un **número local** y en su idioma y horario.
- Calificación con ayuda de IA y entrega a la agencia **lista para cotizar**.
- Medición de punta a punta para optimizar la inversión y liquidar comisiones con transparencia.

Cada combinación agencia × destino × mercado es una **instancia** (doc 11). El contexto de negocio propio de cada una vive en `instances/<id>/README.md`; por ejemplo, [`ec-es`](../instances/ec-es/README.md).

## Actores

| Actor | Papel |
| --- | --- |
| Agencia receptiva | Opera en el destino. Cotiza, contrata, cobra y opera los viajes. Aporta catálogo y material real |
| Socio de marketing | Opera en el mercado emisor. Contenido, campañas, primer contacto y calificación. Factura servicios de marketing a la agencia |
| Viajero | Persona del mercado emisor interesada en viajar al destino |
| Motor | Este repositorio: infraestructura común a todas las instancias |

## Alcance del motor

**Dentro**

- Landings, registro de leads, integración con Meta, WhatsApp y CRM.
- Agente de calificación (asistido) y agente de propuestas (borrador interno).
- Catálogo estructurado y servidor MCP.
- Medición de punta a punta con conversiones offline.
- Configuración por instancia con packs de mercado y destino.

**Fuera (no-objetivos)**

- Vender, cobrar o emitir contratos de viaje.
- Motor de reservas propio o integración con GDS.
- CRM propio.
- App móvil.
- Multi-tenant en un único despliegue (ver ADR 0006).

## Límite legal (principio común a todas las instancias)

El socio de marketing **no vende viajes**. La agencia receptiva es quien cotiza, contrata y cobra. Por eso, en todas las instancias:

- Ningún texto, landing ni agente presenta una oferta cerrada con precio vinculante.
- Los precios se muestran como orientativos, con el aviso que defina el pack de mercado.
- El contrato entre socio y agencia cubre comisiones, tratamiento de datos y propiedad de activos.

Las obligaciones concretas (protección de datos, venta de viajes, transparencia de IA) dependen del mercado y se recogen en su pack. El primero documentado es UE/España: [08-seguridad-y-cumplimiento.md](08-seguridad-y-cumplimiento.md).

## Métricas de éxito de un piloto (3 meses por instancia)

| Métrica | Definición |
| --- | --- |
| CPL | Coste publicitario / leads registrados |
| % calificados | Leads con fechas, personas y producto definidos / leads |
| Tiempo de primera respuesta | Mediana entre `createdAt` y primer mensaje humano o asistido |
| % cotizados | Leads con cotización enviada / leads calificados |
| % ventas | Ventas / leads calificados |
| Coste por venta | Coste publicitario / ventas atribuidas |

Los objetivos numéricos se fijan por instancia con los datos históricos que aporte la agencia.
