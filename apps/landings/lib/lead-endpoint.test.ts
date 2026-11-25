import { describe, expect, it } from "vitest";
import { createAppCheckTokenGetter } from "./app-check.js";
import { firebaseProjectId, leadEndpointUrl } from "./lead-endpoint.js";
import { BASE_RESOLVED_INSTANCE, withResolvedInstance } from "./test-fixtures.js";

const { region, firebaseProjects } = BASE_RESOLVED_INSTANCE.infra;

describe("leadEndpointUrl", () => {
  it("usa LEAD_ENDPOINT_URL si existe (override del emulador)", () => {
    const url = "http://127.0.0.1:5001/demo-proyecto/region-ficticia/ingestLandingLead";
    expect(leadEndpointUrl(BASE_RESOLVED_INSTANCE, { LEAD_ENDPOINT_URL: url, TLA_ENV: "prod" })).toBe(url);
  });

  it("en dev (o sin TLA_ENV) usa infra.region e infra.firebaseProjects.dev", () => {
    const expected = `https://${region}-${firebaseProjects.dev}.cloudfunctions.net/ingestLandingLead`;
    expect(leadEndpointUrl(BASE_RESOLVED_INSTANCE, {})).toBe(expected);
    expect(leadEndpointUrl(BASE_RESOLVED_INSTANCE, { TLA_ENV: "dev", LEAD_ENDPOINT_URL: "" })).toBe(expected);
    expect(firebaseProjectId(BASE_RESOLVED_INSTANCE, {})).toBe(firebaseProjects.dev);
  });

  it("con TLA_ENV=prod usa infra.firebaseProjects.prod", () => {
    expect(leadEndpointUrl(BASE_RESOLVED_INSTANCE, { TLA_ENV: "prod" })).toBe(
      `https://${region}-${firebaseProjects.prod}.cloudfunctions.net/ingestLandingLead`,
    );
    expect(firebaseProjectId(BASE_RESOLVED_INSTANCE, { TLA_ENV: "prod" })).toBe(firebaseProjects.prod);
  });

  it("sin región o sin proyecto devuelve undefined", () => {
    const noRegion = withResolvedInstance((c) => {
      c.infra.region = "";
    });
    const noProject = withResolvedInstance((c) => {
      c.infra.firebaseProjects.dev = "";
    });
    expect(leadEndpointUrl(noRegion, {})).toBeUndefined();
    expect(leadEndpointUrl(noProject, {})).toBeUndefined();
  });
});

describe("createAppCheckTokenGetter en el servidor", () => {
  const config = { apiKey: "", appId: "", projectId: "", recaptchaSiteKey: "" };

  it("sin token de emulador no inicializa Firebase fuera del navegador (SSR)", async () => {
    await expect(createAppCheckTokenGetter(config, {})()).rejects.toThrow(/navegador/);
  });
});
