import { getApps, initializeApp, type App } from "firebase-admin/app";

/** Nombre que `firebase-admin` da a la app por defecto. */
const DEFAULT_APP_NAME = "[DEFAULT]";

/**
 * App de admin por defecto, inicializada de forma perezosa.
 *
 * No basta con `getApps().length === 0` ni con `getApps()[0]`: dentro de un trigger de
 * Firestore, `firebase-functions` crea una app con nombre `__FIREBASE_FUNCTIONS_SDK__`
 * para decodificar el documento, y en el emulador de Cloud Tasks existe la app
 * `tla-tasks-emulator`. Con cualquiera de ellas registrada, esos patrones no inicializan
 * la app por defecto (y `getFirestore()` lanza) o devuelven una app que no es la nuestra.
 */
export function defaultAdminApp(): App {
  return getApps().find((app) => app.name === DEFAULT_APP_NAME) ?? initializeApp();
}
