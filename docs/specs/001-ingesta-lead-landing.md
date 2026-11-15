# Spec 001 · Ingesta de leads desde landing

- **Issue:** (se asigna al crear las issues)
- **Estado:** Borrador
- **Autor:** Tech lead
- **Área:** functions, data

## Contexto

Primera pieza del registro de leads (ADR 0003, doc 03). Recibe el formulario de las landings y crea un lead válido, deduplicado y con consentimiento.

## Comportamiento esperado

1. La landing envía `POST /ingestLandingLead` con el token de App Check en `X-Firebase-AppCheck`.
2. La función valida el token, el cuerpo (Zod) y el consentimiento obligatorio.
3. Normaliza teléfono y email y calcula `dedupeKey`.
4. En una transacción:
   - Si existe un lead abierto con el mismo `dedupeKey` en los últimos 90 días → añade evento `reengaged` y devuelve ese `leadId`.
   - Si no → crea `leads/{leadId}`, `consents/{consentId}`, `dedupe/{dedupeKey}` y el evento `created`.
5. Responde `200 { leadId, deduplicated: boolean }`.

## Contratos

```ts
// packages/shared/src/lead.ts
export const LandingLeadInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  travelMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  pax: z.object({ adults: z.number().int().min(1).max(20), children: z.number().int().min(0).max(10) }).optional(),
  tourIds: z.array(z.string()).max(5).default([]),
  landingSlug: z.string(),
  attribution: AttributionInput,       // UTMs, fbclid, fbc, fbp, eventId
  consent: z.object({
    contact: z.literal(true),
    marketing: z.boolean().default(false),
    textVersion: z.string(),
  }),
  website: z.string().max(0).optional(), // honeypot: debe venir vacío
});
```

Respuesta de error: `400 { error: "validation", fields: [...] }`, `401` sin App Check válido, `429` por límite de frecuencia.

## Casos límite y errores

| Caso | Comportamiento |
| --- | --- |
| Honeypot relleno | `200` falso, no se guarda nada, se registra métrica `spam_blocked` |
| Teléfono no válido | `400` con campo `phone` |
| Mismo envío dos veces (doble clic) | Mismo `leadId`, `deduplicated: true` |
| Mismo teléfono, otra landing, 30 días después | Evento `reengaged` con la nueva atribución |
| Mismo teléfono, lead anterior `lost` | Lead nuevo |
| Más de 5 envíos por IP en 10 min | `429` |

## Seguridad y privacidad

- App Check obligatorio (`enforceAppCheck: true`).
- Logs solo con `leadId` y `landingSlug`.
- `ipHash` = SHA-256 de la IP con *salt* en Secret Manager; la IP en claro no se guarda.
- `retentionUntil` = `createdAt` + 24 meses.

## Criterios de aceptación

- [ ] Lead válido crea `leads`, `consents`, `dedupe` y evento `created` en una sola transacción.
- [ ] Doble envío no crea duplicados.
- [ ] Sin consentimiento de contacto → `400`.
- [ ] Sin App Check → `401`.
- [ ] Tests unitarios de normalización y `dedupeKey` en `domain/`.
- [ ] Test de integración con emuladores para los casos de la tabla.
- [ ] `docs/02-modelo-de-datos.md` refleja los campos finales.

## Fuera de alcance

Reenvío al CRM, notificación a la agencia y CAPI (spec de `onLeadCreated`).

## Plan de pruebas

- Unitarias con Vitest en `functions/src/domain/`.
- Integración: emuladores de Functions y Firestore, App Check con token de depuración.
- Manual: envío real desde la landing en `dev`.
