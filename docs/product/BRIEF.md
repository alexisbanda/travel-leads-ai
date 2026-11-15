# Brief de producto: Travel Leads AI

> Redactado por Ticket Studio a partir de `docs/00-vision.md`, `docs/10-roadmap.md`, el antiguo `scripts/roadmap-issues.txt`, `instances/ec-es/README.md` y la entrevista con el PM. Es el contexto de producto del proyecto. El detalle técnico vive en `docs/product/TECH.md` y en `docs/`.

## Problema

Las agencias receptivas de destinos como Ecuador, Perú o Colombia dependen de intermediarios (OTAs, mayoristas) o de socios puntuales para llegar a viajeros de otros países. En cada mercado emisor les falta presencia local: idioma, un número de teléfono del país, atención en su horario y, con ello, confianza. Tampoco tienen un sistema que diga qué inversión en publicidad acaba en ventas, así que no pueden optimizar campañas ni liquidar comisiones con transparencia. Travel Leads AI es un motor reutilizable que permite a un socio de marketing en un mercado emisor captar, registrar y calificar viajeros para la agencia, y medir el embudo hasta la venta. La primera instancia es `ec-es`: una agencia de Ecuador que capta viajeros en España, donde ya funciona un modelo parecido en EE. UU.

## Usuarios

| Usuario | Qué necesita | Con qué frecuencia usa el producto |
| --- | --- | --- |
| Viajero (mercado emisor) | Información fiable sobre el destino y un primer contacto en su idioma, con número local y en su horario | Puntual, cuando planifica un viaje |
| Socio de marketing (mercado) | Captar leads con contenido y campañas, atender el primer contacto, calificar y saber qué campañas generan ventas | Diario |
| Agencia receptiva (destino) | Recibir leads calificados y listos para cotizar, con un resumen, y que nadie se quede sin respuesta | Diario |
| Tech lead del motor | Abrir y operar instancias por configuración, sin tocar el código del motor | Semanal |

## Flujos principales

1. **Lead desde una landing.** Un viajero llega desde un anuncio o una publicación con UTMs, ve una landing de producto, deja sus datos con consentimiento y recibe una pantalla de gracias con botón a WhatsApp. El lead queda registrado con su atribución, se deduplica, se envía al CRM, se avisa a la agencia y se informa a Meta del evento `Lead`.
2. **Lead desde WhatsApp (Click to WhatsApp).** El anuncio abre WhatsApp con el número local del mercado. El lead se registra con su atribución, y el agente de calificación propone respuestas que una persona aprueba (modo asistido) hasta tener fechas, personas, presupuesto y producto. Entonces pasa a calificado y se entrega a la agencia.
3. **Venta y conversión offline.** La agencia cotiza y cierra en su CRM. Al marcar el deal como ganado, el registro actualiza el lead, crea la venta y la devuelve a Meta como conversión `Purchase`, para optimizar campañas y calcular comisiones.
4. **Vigilancia del tiempo de respuesta.** Si un lead nuevo no recibe respuesta dentro del horario del mercado, se avisa primero al socio y, si sigue sin respuesta, a la agencia.
5. **Abrir una instancia.** El tech lead combina un pack de mercado, un pack de destino y un `instance.yaml`, lo valida y obtiene la configuración resuelta que usan landings, funciones y agentes.

## Glosario del dominio

| Término | Significa |
| --- | --- |
| Agencia receptiva | Agencia del país de destino que cotiza, contrata, cobra y opera los viajes |
| Socio de marketing | Persona o empresa del mercado emisor que capta y califica viajeros y factura servicios de marketing a la agencia |
| Mercado emisor | País de donde salen los viajeros (España en `ec-es`) |
| Destino | País donde la agencia opera los viajes (Ecuador en `ec-es`) |
| Instancia | Una combinación agencia × destino × mercado con su propia configuración y sus propios proyectos (`ec-es`) |
| Pack de mercado | Configuración reutilizable de un mercado: idioma, moneda, régimen legal, región de datos, aviso de IA |
| Pack de destino | Configuración reutilizable de un destino: regiones, temporadas, requisitos de entrada por mercado |
| Lead | Viajero interesado que dejó sus datos o escribió por WhatsApp |
| Lead calificado | Lead con fechas, número de personas y producto definidos |
| Atribución | De qué anuncio, campaña o publicación vino un lead (UTMs, `fbclid`, `ctwa_clid`) |
| Conversión offline | Venta cerrada fuera de la web que se devuelve a Meta para medir y optimizar campañas |
| SLA de primera respuesta | Tiempo máximo para contestar a un lead nuevo dentro del horario del mercado |
| Modo asistido | El agente de IA propone y una persona aprueba antes de enviar |
| Precio orientativo | Rango de precio informativo, nunca vinculante, con el aviso del pack de mercado |

## Qué no es

- No vende, no cobra ni emite contratos de viaje: la agencia receptiva cotiza, contrata y cobra. Ningún texto ni agente confirma precios, disponibilidad o reservas.
- No es un motor de reservas ni se integra con GDS.
- No es un CRM: se usa un CRM SaaS de la agencia.
- No es una app móvil.
- No es un SaaS multi-tenant: cada instancia se despliega aislada en sus propios proyectos.
- No genera destinos, clientes ni testimonios falsos.

## Requisitos no funcionales

- **Idioma:** los textos para viajeros van en el idioma del mercado (es-ES en `ec-es`); la documentación en español neutro.
- **Normativa (UE/España en `ec-es`):** RGPD con consentimiento explícito y registrado, cláusulas contractuales tipo para la transferencia a Ecuador, cookies con Consent Mode v2, aviso de IA obligatorio (AI Act) en el primer mensaje del agente y en el perfil de WhatsApp, reglas de WhatsApp Business (ventana de 24 h y plantillas aprobadas).
- **Datos personales:** solo los campos necesarios, retención limitada (24 meses por defecto sin venta), borrado o anonimización bajo petición, nunca en logs, tests ni prompts de ejemplo.
- **Región de datos:** la que exija el pack de mercado (Europa para `ec-es`).
- **Atención:** horario del mercado (9–21 h, hora de Madrid en `ec-es`), aviso a los 10 min y escalado a los 30 min sin respuesta.
- **Rendimiento de landings:** carga en móvil en menos de 3 s.
- **Plazo:** el piloto de `ec-es` arranca en enero de 2027 para llegar a la temporada de venta del verano europeo (febrero–mayo).
- **Equipo:** el tech lead del motor y el socio de marketing; por ahora no hay junior.

## Épicas por prioridad

1. **Configuración de instancias.** Que una instancia se defina y valide solo con configuración (pack de mercado, pack de destino e `instance.yaml`) y el motor lea siempre la configuración resuelta. Alcance: esquema `InstanceConfig`, `instance:validate`, `instance:build`, `instance:seed`, packs `es` y `ec`, completar `instances/ec-es`. No incluye el despliegue automatizado por instancia.
2. **Registro de leads.** Registrar cada lead de cualquier origen una sola vez, con atribución y consentimiento, y orquestar lo que pasa después. Alcance: ingesta desde landing (spec 001), webhook de Meta Lead Ads, deduplicación, máquina de estados, orquestación tras la creación (CRM, aviso a la agencia, evento `Lead` en Meta) y vigilancia del SLA. No incluye WhatsApp ni la venta.
3. **Landings.** Captar viajeros con landings por producto que conviertan y midan bien. Alcance: plantilla con contenido por instancia, componentes, formulario con App Check y consentimiento, cookies y tracking (GTM, Pixel, UTMs), datos estructurados, sitemap y `llms.txt`. No incluye el contenido definitivo de cada producto.
4. **WhatsApp y agente de calificación.** Atender el primer contacto por WhatsApp y calificar con ayuda de IA en modo asistido. Alcance: webhook del proveedor de WhatsApp, lead con atribución de Click to WhatsApp, agente de calificación con guardrails, filtro de datos personales y evals. No incluye el modo autónomo.
5. **Medición y conversión offline.** Ver el embudo completo hasta la venta y devolver las ventas a Meta. Alcance: webhook del CRM, venta y conversión `Purchase`, exportación a BigQuery, vistas de embudo, SLA y comisiones, y panel. No incluye el informe de comisiones automatizado a la agencia.
6. **Catálogo y propuestas.** Dar al agente y a la agencia un catálogo estructurado de tours con precios orientativos. Alcance: esquema e ingesta del catálogo desde los programas de la agencia, servidor MCP de solo lectura y agente de propuestas (borrador interno para la agencia). No incluye disponibilidad ni reservas.
7. **Operación de la instancia ec-es.** Dejar listas las cuentas, los textos legales y el contenido que el piloto necesita fuera del código. Alcance: proyecto de producción, línea española y WhatsApp Business, cuentas de Meta, GTM y GA4, dominio y correo, encargo legal, elección de CRM y proveedor de WhatsApp, perfiles de público, guía de marca, perfiles en redes y calendario editorial, prueba de punta a punta y lanzamiento del piloto. No lo resuelve un agente de código.
8. **Despliegue por instancia.** Desplegar cada instancia de forma automática y reproducible. Alcance: `deploy:instance`, despliegue a dev al fusionar en `main`, despliegue a producción con tags `{id}@vX.Y.Z` y aprobación manual, autenticación sin claves. Se aborda cuando haga falta más de una instancia o el piloto lo pida.

## Preguntas abiertas

- [ ] Números del modelo en EE. UU. (leads, conversión, ticket medio) para fijar los objetivos del piloto de `ec-es`: pendientes de la agencia.
- [ ] Contrato con la agencia: porcentaje de comisión, propiedad de activos y `leadId` en cada cotización.
- [ ] CRM (HubSpot o Pipedrive) y proveedor de WhatsApp para `ec-es`: sin decidir, ADR pendiente.
- [ ] Nombre comercial definitivo y datos legales de la agencia y del socio para `instance.yaml`.
- [ ] Textos legales (privacidad, cookies, aviso legal) y su versión: pendientes del abogado.
