# ADR 0003 · Registro de leads propio como fuente de verdad

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Las comisiones dependen de atribuir cada venta a un lead generado por el socio de marketing en el mercado. Si los datos solo viven en el CRM o en el WhatsApp de la agencia, la atribución depende de terceros y la relación puede tensarse.

## Decisión

Todo lead, de cualquier origen, entra primero en un registro propio en Firestore con ID único, atribución, consentimiento y un historial de eventos inmutable. Desde ahí se reenvía al CRM y a la agencia. El `leadId` es el identificador común que la agencia usa en sus cotizaciones.

## Consecuencias

- Positivas: atribución verificable, independencia del CRM, base para medición y conversiones offline.
- Negativas: sincronización bidireccional con el CRM que hay que mantener.
- Requisito contractual: la agencia se compromete a registrar el `leadId` en cada cotización y venta.
