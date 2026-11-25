// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const firebaseApp = vi.hoisted(() => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn((options: object, name: string) => ({ name, options })),
}));
const firebaseAppCheck = vi.hoisted(() => ({
  initializeAppCheck: vi.fn(() => ({ appCheck: "ficticio" })),
  ReCaptchaEnterpriseProvider: vi.fn(function (this: { siteKey?: string }, siteKey: string) {
    this.siteKey = siteKey;
  }),
  getToken: vi.fn(async () => ({ token: "token-ficticio-de-firebase" })),
}));
vi.mock("firebase/app", () => firebaseApp);
vi.mock("firebase/app-check", () => firebaseAppCheck);

const { createAppCheckTokenGetter, resetAppCheckForTests } = await import("./app-check.js");

const config = {
  apiKey: "AIzaFAKE-test-api-key",
  appId: "1:123456789:web:abc123",
  projectId: "demo-ficticio",
  recaptchaSiteKey: "fake-recaptcha-site-key-0000",
};

afterEach(() => {
  vi.clearAllMocks();
  resetAppCheckForTests();
});

describe("createAppCheckTokenGetter", () => {
  it("con NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN devuelve ese valor sin inicializar Firebase", async () => {
    const token = await createAppCheckTokenGetter(config, { emulatorToken: "token-emulador-ficticio" })();
    expect(token).toBe("token-emulador-ficticio");
    expect(firebaseApp.initializeApp).not.toHaveBeenCalled();
    expect(firebaseAppCheck.initializeAppCheck).not.toHaveBeenCalled();
  });

  it.each([{}, { emulatorToken: "" }, { emulatorToken: "   " }])(
    "sin token de emulador (%o) usa App Check con ReCaptchaEnterpriseProvider",
    async (env) => {
      const getToken = createAppCheckTokenGetter(config, env);
      expect(firebaseApp.initializeApp).not.toHaveBeenCalled(); // perezoso: nada en la creación
      expect(await getToken()).toBe("token-ficticio-de-firebase");
      expect(await getToken()).toBe("token-ficticio-de-firebase");
      expect(firebaseApp.initializeApp).toHaveBeenCalledTimes(1);
      expect(firebaseApp.initializeApp).toHaveBeenCalledWith(
        { apiKey: config.apiKey, appId: config.appId, projectId: config.projectId },
        expect.any(String),
      );
      expect(firebaseAppCheck.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith(config.recaptchaSiteKey);
      expect(firebaseAppCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
    },
  );

  it("si la inicialización falla, rechaza y reintenta en el siguiente envío", async () => {
    firebaseAppCheck.initializeAppCheck.mockImplementationOnce(() => {
      throw new Error("clave ficticia inválida");
    });
    const getToken = createAppCheckTokenGetter(config, {});
    await expect(getToken()).rejects.toThrow();
    expect(await getToken()).toBe("token-ficticio-de-firebase");
  });
});
