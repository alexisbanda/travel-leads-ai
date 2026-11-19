// Lead ficticio para los tests de tareas: nunca datos reales (AGENTS.md).

export const TEST_LEAD_ID = "01J0000000000000000000000A";
export const TEST_NOW = new Date("2030-01-15T10:00:00.000Z");

export function fakeLeadDoc(leadId: string = TEST_LEAD_ID): Record<string, unknown> {
  return {
    leadId,
    dedupeKey: "a".repeat(64),
    source: "landing",
    status: "new",
    contact: {
      name: "Persona Ficticia",
      email: "qa@example.test",
      country: "XX",
      language: "xx",
    },
    interest: { tourIds: [] },
    attribution: {},
    consentId: "consent-ficticio",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    retentionUntil: TEST_NOW,
  };
}
