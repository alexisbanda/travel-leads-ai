# Spec 005 · Vigilancia del SLA de primera respuesta (`slaWatchdog`)

- **Issue:** #18
- **Estado:** En revisión
- **Autor:** equipo del motor
- **Área:** functions

## Contexto

Un lead puede quedarse horas sin respuesta sin que nadie se dé cuenta, y es la principal causa de perderlo. [Doc 03](../03-registro-de-leads.md#sla-de-primera-respuesta) define el SLA de primera respuesta: aviso al socio tras `warnAfterMinutes` y aviso a la agencia y `sla.breachedAt` tras `breachAfterMinutes`, contando solo dentro del horario de atención del mercado. Esta spec define la función programada que lo vigila.

Piezas que ya existen y se reutilizan:

- `config/sla` ([doc 02](../02-modelo-de-datos.md#configdocid), esquema `ConfigSla` de `@tla/shared`), sembrado con `pnpm instance:seed`: umbrales, `businessHours` y `timezone`.
- `partner.notify` opcional (#16) y `agency.notify`, con el `Notifier` de spec 003 (hoy solo email, vía Trigger Email).
- Índice compuesto `leads (status ASC, createdAt ASC)` en `firestore.indexes.json`.

## Comportamiento esperado

1. `slaWatchdog` (`onSchedule("every 5 minutes")`, región de las opciones globales) se ejecuta cada 5 minutos.
2. Lee `config/sla` y lo valida con `ConfigSla`. Si falta o no es válido, usa los valores de la configuración resuelta (`sla`, `market.businessHours`, `market.timezone`) y registra un error en logs (`detail: "config_sla_fallback"`). Así, cambiar `config/sla` cambia los umbrales en la ejecución siguiente, sin redesplegar.
3. Consulta los candidatos: `status == "new"` y `createdAt` entre `ahora − 14 días` y `ahora − warnAfterMinutes`, en orden por `createdAt`, con un máximo de 200 por ejecución. El límite inferior impide que los leads `new` antiguos se lean para siempre (ver «Casos límite»). El superior es un filtro previo válido, porque los minutos hábiles nunca superan a los de reloj.
4. Descarta en memoria los que tienen `sla.firstResponseAt` o `sla.breachedAt`.
5. Para cada candidato calcula los **minutos hábiles** transcurridos entre `createdAt` y ahora (`businessMinutesBetween`, lógica pura en `functions/src/domain/sla.ts`):
   - Solo cuentan los minutos dentro de `businessHours` (`start`–`end` de los `days` ISO, con 1 = lunes), interpretados en `timezone`, con los cambios de horario de verano incluidos.
   - Un lead creado fuera de horario empieza a contar en la siguiente apertura. Un lead creado poco antes del cierre deja de contar al cierre y sigue en la apertura siguiente.
   - Ejemplo (horario 09:00–21:00, avisos a los 10 y 30 min): un lead creado a las 22:10 empieza a contar a las 09:00 del día hábil siguiente. El aviso al socio sale a las 09:10 (en la ejecución de las 09:10 o en la siguiente) y el aviso a la agencia a las 09:30.
6. Decide los niveles pendientes (`slaLevelsDue`, lógica pura):
   - **`warning`**: minutos hábiles ≥ `warnAfterMinutes` y sin `sla.warnedAt`.
   - **`breach`**: minutos hábiles ≥ `breachAfterMinutes` y sin `sla.breachedAt`.
   - Si ambos están pendientes en la misma ejecución (p. ej. la función estuvo parada), se procesan los dos, primero `warning`.
7. Procesa cada nivel pendiente:
   - **`warning`**: avisa con `partner.notify`. Si la instancia no lo configura, el nivel se omite con un aviso en logs (`detail: "no_channel"`).
   - **`breach`**: avisa con `agency.notify`. Sin canal, se omite igual (`no_channel`).
   - Después del aviso, o al omitirlo, marca el lead en un mismo batch: `sla.warnedAt` o `sla.breachedAt` igual a ahora, `updatedAt` y un evento `sla.warned` o `sla.breached` en `leads/{leadId}/events` (`actor: "system"` y `detail` si se omitió).
8. El estado del lead no cambia: incumplir el SLA no es una transición de la máquina de estados.
9. Un error con un lead se registra y no detiene a los demás. La ejecución termina con error si algún lead falló, para que quede visible en los logs y en las alertas. El reintento lo hace la ejecución siguiente: el scheduler no reintenta por su cuenta.

### Idempotencia: un aviso por lead y nivel

- El aviso usa un id fijo por lead y nivel: `sla-warning-<leadId>` y `sla-breach-<leadId>`. El email lo crea con `create()` en `mail/{id}`, así que repetirlo no duplica el email. Todo canal futuro (`whatsapp_group`, `slack`) debe deduplicar por ese mismo id.
- El orden es: avisar primero y marcar el lead después. Si se marca y el aviso falla, el aviso se perdería. Si se avisa y falla la marca, la ejecución siguiente repite el aviso: `mail/{id}` ya existe, cuenta como enviado y solo se marca el lead.
- La marca se escribe con una precondición de `updateTime`, tomada al leer el lead. Si otra ejecución o una respuesta lo modificó entretanto, se vuelve a evaluar en la ejecución siguiente.

## Contratos

### `Lead.sla` (`@tla/shared`, doc 02)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `sla.firstResponseAt` | timestamp? | Ya existe. Lo escribirá el canal de respuesta (épica WhatsApp) |
| `sla.warnedAt` | timestamp? | **Nuevo.** Aviso al socio enviado u omitido por falta de canal |
| `sla.breachedAt` | timestamp? | Ya existe. Aviso a la agencia enviado u omitido |

### Eventos del lead

`LeadEventType` suma `sla.warned` y `sla.breached`. `detail` es opcional y toma uno de estos valores: `no_channel`, `not_implemented` (canal sin implementación) o `no_recipients` (el secreto no tiene destinatarios).

### `NotifyMessage`

```ts
type NotifyMessage =
  | { kind: "lead_created"; lead: NotifyLeadInput }
  | { kind: "sla_warning" | "sla_breach"; lead: NotifyLeadInput; businessMinutes: number; thresholdMinutes: number };
```

- `notifierFor` recibe el destino que corresponde (`agency.notify` o `partner.notify`) en lugar de leer siempre `agency.notify`.
- Idioma: el aviso a la agencia usa `agency.locale` o, si falta, el del mercado. El aviso al socio usa siempre el del mercado.
- Los textos de los emails van en `domain/notify-email.ts` (`es` y `en`), junto a los del aviso de lead nuevo, porque son avisos internos y no textos para viajeros.

Contenido del email (datos ficticios):

```text
Asunto: SLA en riesgo · 12 min sin respuesta · landing
Un lead nuevo lleva 12 minutos hábiles sin primera respuesta (umbral: 10).
Nombre: Persona Ficticia
Origen: landing
leadId: 01JD0000000000000000000000
```

### Función

- `slaWatchdog` se exporta en `functions/src/index.ts`.
- Si `partner.notify` o `agency.notify` existen, ata sus secretos `target`.
- `retryCount: 0` y `timeoutSeconds: 120`.

## Casos límite y errores

| Caso | Comportamiento |
| --- | --- |
| Lead creado fuera de horario o en día no hábil | Cuenta desde la siguiente apertura, en `timezone` |
| Lead creado poco antes del cierre | Los minutos se pausan al cierre y siguen en la apertura siguiente |
| Cambio de horario de verano en `timezone` | Los minutos hábiles se calculan sobre instantes reales: no se cuenta dos veces ni se pierde una hora |
| La función se ejecuta varias veces con el mismo lead vencido | Un solo aviso por nivel (`sla.warnedAt` / `sla.breachedAt` y `mail/{id}` determinista) |
| Se superan los dos umbrales en la misma ejecución | Se envían los dos avisos, primero el del socio |
| Sin `partner.notify` | El nivel `warning` se omite: aviso en logs, `sla.warnedAt` y evento `sla.warned` (`no_channel`). El nivel `breach` sigue igual |
| Sin `agency.notify` | El nivel `breach` se omite igual (`no_channel`) |
| Canal configurado sin implementación | El nivel se omite con `not_implemented` |
| Falla el envío del aviso | No se marca el lead. Se registra el error y se reintenta en la ejecución siguiente |
| `config/sla` ausente o inválido | Se usa la configuración resuelta y se registra un error (`config_sla_fallback`) |
| El lead pasa a `contacted` o recibe `firstResponseAt` | Deja de ser candidato. Los avisos ya enviados no se retiran |
| Lead `new` con más de 14 días | Fuera de la consulta. Con cualquier horario de al menos un día por semana, los dos niveles ya se han alcanzado antes |
| Más de 200 candidatos | Se procesan los 200 más antiguos. El resto, en las ejecuciones siguientes |
| Lead que no cumple el esquema mínimo | Se omite con un error en logs (`invalid_lead`) y no detiene a los demás |

## Seguridad y privacidad

- Lee de cada lead solo `leadId`, `source`, `status`, `contact.name`, `createdAt` y `sla`. El email del aviso lleva el nombre, igual que el aviso de lead nuevo (#16). Nunca lleva teléfono ni email del viajero.
- Logs: solo `leadId`, nivel, resultado, `detail`, minutos hábiles y umbral. Nunca datos de contacto ni destinatarios.
- Los destinos de los avisos salen de secretos (`secret:NOMBRE`) y se leen al enviar.
- Firestore solo desde el servidor. Las reglas no cambian.

## Criterios de aceptación

- [ ] [test] Un lead `new` sin `firstResponseAt`, creado hace 11 minutos dentro del horario, genera un aviso al socio. Si se creó hace 31 minutos, genera un aviso a la agencia y `sla.breachedAt`
- [ ] [test] Un lead creado fuera del horario mide el tiempo desde la apertura siguiente, en la zona horaria del mercado. Incluye el ejemplo de las 22:10 y un caso con cambio de horario de verano
- [ ] [test] Cada aviso se envía una sola vez por lead y nivel, aunque la función se ejecute varias veces. Se prueba en el emulador con tres ejecuciones seguidas
- [ ] [test] Cambiar `config/sla` cambia los umbrales sin redesplegar. Si `config/sla` falta o no es válido, se usa la configuración resuelta
- [ ] [test] Sin `partner.notify`, el nivel `warning` se omite con aviso en logs y `breach` funciona igual
- [ ] [test] Los logs y los eventos no llevan datos de contacto

## Fuera de alcance

- Mensaje automático de acuse fuera de horario (épica WhatsApp y agente, #20).
- Escribir `sla.firstResponseAt`: lo hará el canal de respuesta.
- Panel de SLA (épica Medición, #21).
- Festivos: el horario solo distingue días de la semana. Si hacen falta, se añaden al esquema de `BusinessHours` con su pack.

## Plan de pruebas

- **Unitarias** (`domain/sla.test.ts`):
  - `businessMinutesBetween`: dentro del horario, fuera de horario, a caballo del cierre, días no hábiles, fin de semana largo y cambios de horario de verano en una zona con DST.
  - `slaLevelsDue`: cada combinación de umbrales y marcas.
- **Unitarias** (`notify-email.test.ts`): textos de `sla_warning` y `sla_breach` en `es` y `en`, con HTML escapado.
- **Handler** (`sla-watchdog.test.ts`, con un store y un notifier falsos):
  - los dos niveles y su orden;
  - omisión por falta de canal;
  - fallo del aviso sin marcar el lead;
  - un fallo en un lead que no detiene a los demás;
  - `config/sla` inválido;
  - logs sin datos personales.
- **Emulador** (`sla-watchdog.emulator.test.ts`):
  - tres ejecuciones seguidas generan un solo `mail/{id}` por nivel;
  - cambiar `config/sla` entre ejecuciones cambia el resultado.
- **Manual en dev**: crear un lead de prueba, esperar el umbral con `config/sla` reducido (p. ej. 1 y 2 minutos) y comprobar los dos emails.
