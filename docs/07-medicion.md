# 07 · Medición

## Objetivo

Saber, para cada euro invertido, cuántos leads, cuántos calificados y cuántas ventas produjo, y poder liquidar comisiones sin discusión.

## Convención de UTMs

| Parámetro | Valores | Ejemplo |
| --- | --- | --- |
| `utm_source` | `meta` · `tiktok` · `google` · `whatsapp` · `creator` · `organic` | `meta` |
| `utm_medium` | `paid` · `social` · `referral` · `email` | `paid` |
| `utm_campaign` | `<año><mes>_<producto>_<segmento>` | `2611_galapagos_couple` (ejemplo `ec-es`) |
| `utm_content` | `<formato>_<gancho>_<variante>` | `reel_precio-real_b` |
| `utm_term` | Audiencia o palabra clave | `lookalike-buyers-1` |

Todo en minúsculas, sin espacios ni tildes. La junior mantiene una hoja de UTMs generados.

## Taxonomía de eventos

| Evento | Dónde | Destinos |
| --- | --- | --- |
| `page_view` | Landing | GA4 |
| `view_tour` | Landing (scroll al itinerario) | GA4, Pixel `ViewContent` |
| `click_whatsapp` | CTA | GA4, Pixel `Contact` |
| `generate_lead` | Formulario enviado | GA4, Pixel + CAPI `Lead` (mismo `eventId`) |
| `lead_qualified` | Backend | CAPI evento personalizado `QualifiedLead` |
| `quote_sent` | CRM → backend | BigQuery |
| `purchase` | CRM → backend | CAPI `Purchase` (offline) con valor |

Optimizar campañas hacia `QualifiedLead` en cuanto haya volumen suficiente, y hacia `Purchase` cuando lo haya; no quedarse en `Lead`.

## Conversions API

- Envío desde Functions con `META_CAPI_ACCESS_TOKEN`.
- Datos de usuario siempre **hasheados con SHA-256** (email, teléfono E.164 sin `+`, nombre) y solo si el consentimiento lo permite.
- Incluir `fbc`, `fbp`, `client_ip_address` y `client_user_agent` cuando existan; `ctwa_clid` para Click to WhatsApp.
- Revisar en el Administrador de eventos la calidad de coincidencia (EMQ) cada semana.

## BigQuery y paneles

Dataset `analytics` en `infra.bigqueryLocation` de la instancia (`EU` en mercados europeos), alimentado por la extensión de Firestore. Vistas:

| Vista | Uso |
| --- | --- |
| `v_funnel_daily` | Leads, calificados, cotizados, ventas por día y campaña |
| `v_sla` | Mediana y p90 de primera respuesta, incumplimientos |
| `v_commissions` | Ventas atribuidas, importe, comisión, estado de pago |
| `v_agent_quality` | Resultado de borradores del agente por versión de prompt |

El coste publicitario se importa desde Meta (exportación diaria o conector) para calcular CPL y coste por venta.

## KPIs del panel principal (Looker Studio)

1. Coste por lead y coste por lead calificado, por campaña y creatividad.
2. Embudo: leads → calificados → cotizados → ventas.
3. Tiempo de primera respuesta (mediana y p90).
4. Coste por venta y retorno de la inversión publicitaria.
5. Comisiones devengadas y pendientes.

## Revisión semanal (30 min)

1. ¿Qué creatividades tienen mejor coste por lead calificado? → escalar.
2. ¿Cuáles están por encima del umbral durante 3 días? → pausar.
3. ¿Incumplimientos de SLA? → causa y acción.
4. ¿Qué borradores del agente se editaron más? → nuevos casos de evals.
5. ¿Ventas cerradas sin atribución? → revisar el flujo de IDs con la agencia.
