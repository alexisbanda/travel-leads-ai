import type { AppCheck } from "firebase/app-check";

/**
 * Token de App Check para `X-Firebase-AppCheck`. Firebase se carga e
 * inicializa de forma perezosa en el primer envío (nunca en el import ni en
 * SSR) y solo con `firebase/app` y `firebase/app-check`.
 */

/** Configuración pública de la app web de Firebase de la instancia. */
export interface AppCheckWebConfig {
  apiKey: string;
  appId: string;
  projectId: string;
  recaptchaSiteKey: string;
}

export type GetAppCheckToken = () => Promise<string>;

export interface AppCheckEnv {
  /**
   * `NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN`: solo para el emulador. Si no está
   * vacío se envía tal cual, sin inicializar Firebase; el backend real lo rechaza.
   */
  emulatorToken?: string;
}

const FIREBASE_APP_NAME = "landings-lead-form";

let appCheckPromise: Promise<AppCheck> | undefined;

async function initAppCheck(config: AppCheckWebConfig): Promise<AppCheck> {
  const [{ getApps, initializeApp }, { initializeAppCheck, ReCaptchaEnterpriseProvider }] = await Promise.all([
    import("firebase/app"),
    import("firebase/app-check"),
  ]);
  const app =
    getApps().find((candidate) => candidate.name === FIREBASE_APP_NAME) ??
    initializeApp(
      { apiKey: config.apiKey, appId: config.appId, projectId: config.projectId },
      FIREBASE_APP_NAME,
    );
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

/** Solo para tests: olvida la instancia de App Check cacheada. */
export function resetAppCheckForTests(): void {
  appCheckPromise = undefined;
}

/**
 * Devuelve la función que obtiene el token: el del emulador si
 * `env.emulatorToken` no está vacío; si no, App Check con reCAPTCHA Enterprise.
 */
export function createAppCheckTokenGetter(
  config: AppCheckWebConfig,
  env: AppCheckEnv = { emulatorToken: process.env.NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN },
): GetAppCheckToken {
  return async () => {
    const emulatorToken = env.emulatorToken?.trim();
    if (emulatorToken) return emulatorToken;
    if (typeof window === "undefined") throw new Error("App Check solo se inicializa en el navegador");
    appCheckPromise ??= initAppCheck(config).catch((error: unknown) => {
      appCheckPromise = undefined;
      throw error;
    });
    const appCheck = await appCheckPromise;
    const { getToken } = await import("firebase/app-check");
    return (await getToken(appCheck, false)).token;
  };
}
