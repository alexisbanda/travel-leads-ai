# ADR 0007 · WhatsApp: Cloud API de Meta detrás de un adaptador de BSP

- **Estado:** Aceptada
- **Fecha:** 2026-11-27
- **Decisores:** equipo del motor

## Contexto

Sin proveedor de WhatsApp no se pueden fijar el formato del webhook, la firma, el envío de plantillas ni dónde aprueba una persona los borradores del agente (modo asistido, [ADR 0005](0005-agentes-modo-asistido.md)). Hoy `channels.whatsapp.bsp` admite `respond_io`, `360dialog` u `other`, y `ec-es` declara `respond_io` con la nota «ADR pendiente».

Restricciones:

- **Región de datos** ([doc 08](../08-seguridad-y-cumplimiento.md)): el pack de mercado `es` exige datos en la UE. El contenido de los mensajes también cuenta.
- **Modo asistido:** una persona aprueba, edita o descarta cada borrador antes de enviarlo. Hace falta una bandeja.
- **Plazo:** la demo para socios necesita el flujo landing → lead → WhatsApp funcionando sin contratar nada todavía y sin datos reales.
- **Coste:** desde octubre de 2026 Meta cobra por mensaje entregado también los mensajes de servicio, además de las plantillas. El BSP suma su cuota por número.
- **Política de la plataforma:** desde el 15 de enero de 2026 no se admiten asistentes de IA de propósito general; los agentes de atención y ventas del propio negocio sí ([doc 06](../06-agentes-ia.md)).
- **Borrado (`eraseLead`):** hay que poder borrar del motor los mensajes de un lead. Lo que guarde un tercero se borra por su API o su panel.

## Opciones consideradas

| Criterio                        | Cloud API de Meta (directa)                                                                         | 360dialog                                                  | respond.io                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bandeja para aprobar borradores | No tiene. Habría que construirla en el motor                                                        | No tiene (solo API)                                        | Sí: bandeja de equipo. Falta comprobar cómo entra un borrador externo (nota interna o sugerencia) |
| Webhook y firma                 | `X-Hub-Signature-256` (HMAC-SHA256 con el secreto de la app), el mismo patrón que `metaLeadWebhook` | Formato de Cloud API reenviado por 360dialog; firma propia | Webhooks propios con clave de firma; el número queda conectado a respond.io, no al motor          |
| Plantillas                      | Graph API / WhatsApp Manager                                                                        | API de 360dialog                                           | Panel y API de respond.io                                                                         |
| Región de datos                 | _Local storage_ por número: UE (Alemania), Reino Unido o Suiza                                      | _Local storage_ de Cloud API, mismo mecanismo              | Depende de su propio alojamiento además del de Meta; por verificar                                |
| Coste fijo                      | Ninguno (solo tarifas de Meta)                                                                      | Desde 49 €/mes por número + Meta                           | Plan mensual por equipo + Meta                                                                    |
| Entorno de pruebas              | Número de prueba gratuito, hasta 5 destinatarios, plantilla `hello_world`                           | Sandbox propio                                             | Necesita cuenta                                                                                   |
| Borrado                         | Solo lo que guarde el motor (Meta conserva según su política)                                       | Igual + lo que guarde 360dialog                            | Igual + contactos y conversaciones en respond.io                                                  |

1. **Cloud API directa.** Pros: sin intermediario ni cuota, mismo patrón de firma que Meta Lead Ads, _local storage_ en la UE, número de prueba para la demo. Contras: no hay bandeja; el modo asistido necesitará una bandeja propia o un BSP con bandeja.
2. **360dialog.** Pros: soporte y facturación europea, cuota baja. Contras: tampoco tiene bandeja, así que no resuelve el modo asistido y añade un intermediario.
3. **respond.io.** Pros: bandeja de equipo lista para el modo asistido. Contras: el número vive en respond.io (el motor recibe sus webhooks, no los de Meta), coste fijo por equipo y otro sitio donde viven datos personales. Falta verificar cómo se inyecta un borrador para que una persona lo apruebe.

## Decisión

1. El motor habla con WhatsApp **siempre a través de una interfaz `WhatsappBspAdapter`** en `functions/src/integrations/whatsapp/`: verificar la firma, convertir cada entrega a eventos normalizados (mensaje entrante, estado de un mensaje saliente) y enviar texto libre o plantillas. Ningún otro módulo conoce el formato de un BSP.
2. **El primer adaptador es la Cloud API de Meta directa** (`bsp: meta_cloud`). Se usa en desarrollo, en la demo y en el piloto de `ec-es`. Con un número real, el _local storage_ se activa en la región que exija el pack de mercado (UE para `es`) antes de enviar el primer mensaje.
3. **La bandeja del modo asistido se decide con el agente de calificación (#58)**, no ahora. Antes de #58 se hace una prueba corta con respond.io para responder: «¿puede una persona aprobar o editar en la bandeja un borrador que genera el motor antes de enviarlo?». Si la respuesta es sí y el coste encaja, se añade el adaptador `respond_io`. Si no, el motor tendrá su propia bandeja mínima sobre Cloud API. Esa decisión irá en un ADR que sustituya este punto.

Respuesta a la pregunta de #50 hoy: con Cloud API directa o 360dialog, **no** hay bandeja del BSP donde aprobar borradores; con respond.io, probablemente sí, pendiente de la prueba anterior.

## Consecuencias

- Positivas:
  - La demo funciona sin contratos: número de prueba de Meta y teléfonos propios del equipo y de los socios, sin datos reales de leads.
  - El webhook reutiliza la verificación de firma y el patrón de inbox de Meta Lead Ads (doc 03).
  - Cambiar de BSP afecta a un adaptador y a la configuración, no al dominio.
- Negativas / deuda aceptada:
  - `WhatsappBsp` gana el valor `meta_cloud` y `channels.whatsapp` necesita campos propios de Cloud API (spec 006). Doc 11 y `instance.yaml` se actualizan con el cambio.
  - Mientras no haya bandeja, los mensajes que no sean plantillas automáticas solo se pueden enviar desde el motor (scripts de la demo), no desde un panel.
  - El número de prueba de Meta no sirve para tráfico real ni garantiza _local storage_: solo datos ficticios o de personas que dan su consentimiento para la demo.
- Cuándo revisar esta decisión: al especificar #58 (bandeja del modo asistido), si cambia la política o la tarifa de Meta, o si un mercado exige una región que el _local storage_ no cubra.

Fuentes: documentación de Meta sobre [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started), [webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/), [precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) y [proveedores de IA](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers); [precios de 360dialog](https://docs.360dialog.com/partner/get-started/pricing-and-plans); [Cloud API en respond.io](https://respond.io/help/whatsapp/whatsapp-cloud-api). Consultadas el 2026-11-27.
