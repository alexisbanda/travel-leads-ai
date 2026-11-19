import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAdminApp } from "./firebase-app.js";

describe("defaultAdminApp", () => {
  afterEach(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
  });

  it("initializes the default app even when a named app already exists", () => {
    initializeApp({ projectId: "demo-firebase-app" }, "__FIREBASE_FUNCTIONS_SDK__");

    const app = defaultAdminApp();

    expect(app.name).toBe("[DEFAULT]");
    expect(getApps().map((a) => a.name).sort()).toEqual(["[DEFAULT]", "__FIREBASE_FUNCTIONS_SDK__"]);
  });

  it("returns the same default app on repeated calls", () => {
    initializeApp({ projectId: "demo-firebase-app" }, "__FIREBASE_FUNCTIONS_SDK__");

    expect(defaultAdminApp()).toBe(defaultAdminApp());
  });

  it("reuses an existing default app", () => {
    const existing = initializeApp({ projectId: "demo-firebase-app" });

    expect(defaultAdminApp()).toBe(existing);
  });
});
