# ADR 0002 · CRM SaaS en lugar de CRM propio

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

La agencia necesita gestionar el pipeline comercial (contactar, cotizar, cerrar). Lo difícil de un CRM no es construirlo, sino que los vendedores lo usen a diario, también desde el móvil.

## Opciones consideradas

1. CRM propio: control total; meses de desarrollo y riesgo alto de baja adopción.
2. HubSpot (plan gratuito o Starter): app móvil, integración con WhatsApp, coste bajo al inicio.
3. Pipedrive: muy orientado a pipeline de ventas, simple para equipos pequeños.

## Decisión

CRM SaaS (HubSpot o Pipedrive; se elige con la agencia según su preferencia). El registro de leads propio (ADR 0003) garantiza que los datos y la atribución no dependen del CRM.

## Consecuencias

- Positivas: arranque inmediato, sin mantenimiento.
- Negativas: coste por usuario al crecer; integración vía API y webhooks.
- Revisar si: aparecen límites reales tras 6 meses de uso.
