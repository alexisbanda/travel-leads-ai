// Punto de entrada de Cloud Functions. Ver functions/README.md para el mapa previsto.
import { setGlobalOptions } from "firebase-functions/v2";
import { loadInstanceConfig } from "./config.js";
import { createIngestLandingLeadFunction } from "./http/ingest-landing-lead.js";
import { createMetaLeadWebhookFunction } from "./http/meta-lead-webhook.js";
import {
  createAgencyNotifyTaskFunction,
  createCrmUpsertTaskFunction,
  createMetaCapiLeadTaskFunction,
} from "./tasks/lead-task-functions.js";
import { createOnLeadCreatedFunction } from "./triggers/on-lead-created.js";
import { createProcessMetaInboxFunction } from "./triggers/process-meta-inbox.js";

// La región sale de la configuración resuelta de la instancia
// (`pnpm instance:build <id>`), nunca de constantes.
const config = loadInstanceConfig();
setGlobalOptions({ region: config.infra.region });

// Las funciones se definen después de `setGlobalOptions`: `onRequest` y compañía leen
// las opciones globales en el momento de definirse.
export const metaLeadWebhook = createMetaLeadWebhookFunction();
export const ingestLandingLead = createIngestLandingLeadFunction(config);
// Entregas de Meta Lead Ads en `inbox/` → lead (docs/specs/004-meta-lead-ads-ingesta.md).
export const processMetaInbox = createProcessMetaInboxFunction(config);

// Orquestación tras crear un lead (docs/specs/003-on-lead-created.md). Los nombres de
// las tareas son los de sus colas: deben coincidir con `LEAD_TASK_FUNCTIONS`.
export const onLeadCreated = createOnLeadCreatedFunction(config);
export const crmUpsertTask = createCrmUpsertTaskFunction(config);
export const agencyNotifyTask = createAgencyNotifyTaskFunction(config);
export const metaCapiLeadTask = createMetaCapiLeadTaskFunction();
