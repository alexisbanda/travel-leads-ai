import { describe, expect, it } from "vitest";
import { notifierFor, type Notifier } from "./index.js";

const target = { channel: "email" as const, target: "secret:AGENCY_NOTIFY_TARGET" };

describe("notifierFor", () => {
  it("sin agency.notify → no_channel", () => {
    expect(notifierFor({ agency: {} })).toEqual({ status: "no_channel" });
  });

  it("canal sin implementación → not_implemented", () => {
    expect(notifierFor({ agency: { notify: target } }, {})).toEqual({
      status: "not_implemented",
      channel: "email",
    });
  });

  it("canal registrado → ready con el notifier creado para su destino", () => {
    const notifier: Notifier = { notify: async () => undefined };
    const seen: unknown[] = [];
    const resolution = notifierFor(
      { agency: { notify: target } },
      {
        email: (t) => {
          seen.push(t);
          return notifier;
        },
      },
    );
    expect(resolution).toEqual({ status: "ready", channel: "email", notifier });
    expect(seen).toEqual([target]);
  });
});
