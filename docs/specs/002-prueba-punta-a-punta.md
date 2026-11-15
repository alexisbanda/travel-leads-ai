# Spec 002 · Prueba de punta a punta antes de lanzar

- **Estado:** Aprobada
- **Responsable de ejecución:** Junior (con revisión del tech lead)
- **Cuándo:** antes del primer lanzamiento y antes de cada landing o campaña nueva

Usar siempre datos ficticios evidentes (`Prueba QA`, teléfono de pruebas del equipo).

## Landing

- [ ] La landing carga en móvil en menos de 3 s (4G simulado en Lighthouse).
- [ ] El banner de cookies aparece; al rechazar, no se carga el Pixel (comprobar en DevTools → Network).
- [ ] Al aceptar, el Pixel dispara `PageView` (Meta Pixel Helper).
- [ ] Los UTMs de la URL de prueba se conservan hasta el envío.
- [ ] El formulario rechaza un teléfono inválido y exige el consentimiento.
- [ ] El botón de WhatsApp abre el chat con el mensaje y el código de campaña correctos.
- [ ] Los enlaces a privacidad, cookies y aviso legal funcionan.

## Registro de leads

- [ ] El lead aparece en Firestore (`dev`) con atribución completa y `consentId`.
- [ ] Un segundo envío con el mismo teléfono no crea un lead nuevo.
- [ ] Aparece el evento `Lead` en el Administrador de eventos de Meta con el mismo `event_id` en navegador y servidor (deduplicado).

## Orquestación

- [ ] Se crea el contacto y el deal en el CRM con el `leadId`.
- [ ] La agencia recibe la notificación con el resumen.
- [ ] Si nadie responde en `sla.warnAfterMinutes` dentro del horario del mercado, llega la alerta de SLA.

## WhatsApp y agente

- [ ] Un mensaje desde un anuncio de prueba Click to WhatsApp crea el lead con `source: whatsapp`.
- [ ] El primer borrador del agente se identifica como asistente con IA.
- [ ] Pedir "precio exacto" provoca derivación a humano.
- [ ] Al aprobar el borrador, el mensaje se envía y queda `firstResponseAt`.

## Venta y medición

- [ ] Mover el deal a **Ganado** en el CRM actualiza el lead a `won` y crea `sales/{id}`.
- [ ] La conversión `Purchase` aparece en Meta (puede tardar).
- [ ] El lead y la venta aparecen en BigQuery y en el panel de Looker Studio.

## Limpieza

- [ ] Borrar los datos de prueba con `eraseLead` en `dev`, CRM y BSP.
- [ ] Anotar fallos como issues con la etiqueta `type:bug`.
