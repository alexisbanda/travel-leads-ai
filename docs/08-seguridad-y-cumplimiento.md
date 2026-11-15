# 08 · Seguridad y cumplimiento

> Este documento resume obligaciones técnicas. **No sustituye asesoramiento legal.** Los textos legales, el contrato con la agencia y la estructura fiscal deben revisarlos un abogado y un gestor.

## Marco común a todas las instancias

Estas reglas aplican sea cual sea el mercado, y el motor las impone en código:

- El socio de marketing **no vende viajes**: la agencia receptiva cotiza, contrata y cobra. Ningún flujo cobra al viajero, ningún agente confirma precio ni reserva y las landings muestran precios **orientativos**.
- Consentimiento explícito y registrado (`consents`) antes de contactar.
- Minimización: solo los campos de `leads`; nada de documentos de identidad ni datos de salud.
- Retención limitada (`compliance.dataRetentionMonths`) y función `eraseLead(leadId)` que borra o anonimiza en Firestore, CRM y BSP.
- Aviso de que el viajero habla con una IA, aunque el mercado no lo exija.
- Nada de contenido sintético que se haga pasar por real: **no** se generan destinos ni clientes falsos.

Lo que cambia por mercado (base legal, región de datos, cookies, normativa de venta de viajes, textos legales) se define en el **pack de mercado** y lo valida `pnpm instance:validate`. Cada pack nuevo necesita revisión de un abogado de ese mercado antes de usarse en producción.

## Pack de mercado UE / España (`es`)

Aplica a la instancia `ec-es` y a cualquier instancia con mercado español. La mayor parte (RGPD, cookies, AI Act) es común a otros mercados de la UE, que reutilizarán esta base.

### Normativa de viajes

- En España, vender u ofrecer viajes combinados exige ser agencia de viajes con garantías financieras.
- Por eso el socio en España presta solo servicios de marketing y la agencia receptiva es quien contrata.

### RGPD

| Aspecto | Implementación |
| --- | --- |
| Base legal | Consentimiento para contacto comercial (checkbox no premarcado). Marketing posterior: consentimiento separado y opcional |
| Prueba del consentimiento | Colección `consents` con versión del texto, canal y fecha |
| Información | Política de privacidad enlazada junto al formulario y en el primer mensaje de WhatsApp |
| Roles | Contrato de tratamiento entre el socio y la agencia, definiendo responsable/encargado |
| Transferencia internacional | Si el país de destino no tiene decisión de adecuación de la UE (caso de Ecuador) → **cláusulas contractuales tipo** en el contrato con la agencia (`compliance.internationalTransfer: scc`) |
| Región de datos | Proyectos de la instancia en región europea; BigQuery en `EU` (valor bloqueado por el pack) |
| Conservación | Leads sin venta: borrado o anonimización a los 24 meses por defecto. Ventas: según obligaciones fiscales |
| Subencargados | Google Cloud, proveedor de WhatsApp, CRM, Anthropic, Google (Gemini), Meta: listados en la política de privacidad |

### Cookies

- Banner con aceptar y rechazar al mismo nivel. Sin consentimiento no se cargan Pixel ni GA4 con cookies.
- Google Consent Mode v2 configurado en GTM.
- La Conversions API solo envía datos de usuario si hay consentimiento de marketing.

### AI Act (transparencia)

- Desde el 2 de agosto de 2026 es obligatorio informar a las personas de que interactúan con un sistema de IA.
- El agente de WhatsApp se identifica en su primer mensaje y en la descripción del perfil (texto bloqueado en el pack).
- Contenido sintético que pueda parecer real (imágenes, vídeo, voz) se etiqueta como generado con IA.

## Otros mercados

Antes de crear un pack para un mercado nuevo, documentar aquí una sección equivalente con: base legal de datos y de mensajería comercial, región de datos, cookies o rastreo, normativa de venta de viajes (por ejemplo, registros de *seller of travel* en algunos estados de EE. UU.) y obligaciones de transparencia de IA. Fuentes y revisión legal obligatorias.

## WhatsApp Business Platform

- Desde el 15 de enero de 2026 la plataforma prohíbe chatbots de IA de propósito general. Los agentes de soporte y ventas del propio negocio están permitidos.
- Respuestas libres solo en la ventana de 24 h; fuera, plantillas aprobadas.
- Opt-in explícito antes de enviar plantillas de marketing.

## Seguridad técnica

| Control | Detalle |
| --- | --- |
| Reglas Firestore | Denegar todo desde clientes (`firestore.rules`) |
| App Check | reCAPTCHA Enterprise en landings; obligatorio en `ingestLandingLead` |
| Webhooks | Verificación de firma en todos; secretos rotables |
| Secretos | Secret Manager del proyecto de cada instancia con `defineSecret`; en `instance.yaml` solo referencias `secret:NOMBRE` |
| IAM | Cuentas de servicio por función con mínimo privilegio; MCP con acceso de solo lectura al catálogo |
| Rate limiting | Por IP y por `dedupeKey` en ingesta |
| Logs | Sin PII en claro: `leadId` en lugar de nombre o teléfono |
| Dependencias | Dependabot + `pnpm audit` en CI |
| Accesos | 2FA obligatorio en GitHub, Google, Meta, CRM y BSP |
| Copias | Exportación programada de Firestore a Cloud Storage en la región de la instancia |
| Aislamiento | Un par de proyectos por instancia; ninguna credencial da acceso a dos instancias |

## Propiedad de activos

Por instancia, registrar en el contrato y en `instances/<id>/activos.md` (o fuera del repo si contiene datos sensibles) quién es titular de: dominio, número de WhatsApp, Business Manager, cuenta publicitaria, Pixel, páginas de redes, proyectos de Firebase, CRM y base de leads.
