// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingLeadInput, type ResolvedInstanceConfig } from "@tla/shared";
import { whatsappHref } from "../lib/format.js";
import type { LeadFormView } from "../lib/lead-form.js";
import { BASE_RESOLVED_INSTANCE, buildLanding, withResolvedInstance } from "../lib/test-fixtures.js";
import { buildLandingView } from "../lib/view.js";
import { LandingView } from "./LandingView.js";
import { LeadForm } from "./LeadForm.js";

/** Directorio de este archivo (en jsdom `URL` no es el de Node). */
const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const texts = BASE_RESOLVED_INSTANCE.marketPack.landingUi.form;
const legal = BASE_RESOLVED_INSTANCE.marketPack.legalTexts;
const FAKE_E164 = BASE_RESOLVED_INSTANCE.channels.whatsapp.number;
const FAKE_NATIONAL = parsePhoneNumberFromString(FAKE_E164)!.formatNational();
const PREFILL = "Mensaje de ejemplo [EJ-01]";
const TOKEN = "token-app-check-ficticio";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const formLanding = buildLanding({ sections: ["cta"], cta: { type: "form", prefill: PREFILL } });

function formView(instance: ResolvedInstanceConfig = BASE_RESOLVED_INSTANCE): LeadFormView {
  const section = buildLandingView(formLanding, instance).sections.find((s) => s.kind === "form");
  if (section?.kind !== "form") throw new Error("la landing de prueba no tiene formulario");
  return section.form;
}

const response = (status: number, json: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => json }) as Response;

function renderForm(fetchImpl: typeof fetch, view: LeadFormView = formView()) {
  const getAppCheckToken = vi.fn(async () => TOKEN);
  const result = render(<LeadForm {...view} getAppCheckToken={getAppCheckToken} fetchImpl={fetchImpl} />);
  return { ...result, getAppCheckToken };
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

function fillValid({ phone = FAKE_NATIONAL, consent = true } = {}) {
  fireEvent.change(input(texts.nameLabel), { target: { value: "Viajera Ficticia" } });
  fireEvent.change(input(texts.phoneLabel), { target: { value: phone } });
  fireEvent.change(input(texts.emailLabel), { target: { value: "viajera@example.test" } });
  fireEvent.change(input(texts.travelMonthLabel), { target: { value: "2027-03" } });
  fireEvent.change(input(texts.adultsLabel), { target: { value: "2" } });
  if (consent) fireEvent.click(input(legal.commercialConsent));
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: texts.submit }));

function sentBody(fetchImpl: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const init = fetchImpl.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

/** Error asociado al campo por `aria-describedby`. */
function describedError(el: HTMLElement): string | null | undefined {
  const id = el.getAttribute("aria-describedby");
  return id ? document.getElementById(id)?.textContent : undefined;
}

async function blockingViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`);
}

describe("LeadForm en la landing", () => {
  it("con cta.type=form la sección cta renderiza el formulario (y no el enlace de WhatsApp)", () => {
    render(<LandingView view={buildLandingView(formLanding, BASE_RESOLVED_INSTANCE)} />);
    expect(screen.getByRole("button", { name: texts.submit })).toBeTruthy();
    expect(screen.queryByRole("link", { name: BASE_RESOLVED_INSTANCE.marketPack.landingUi.whatsappCta })).toBeNull();
  });

  it("sin infra.region no hay endpoint: no se renderiza y se avisa sin PII", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const instance = withResolvedInstance((c) => {
      c.infra.region = "";
    });
    expect(buildLandingView(formLanding, instance).sections).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(formLanding.slug));
  });
});

describe("textos desde el pack (#5)", () => {
  it("renderiza etiquetas, consentimientos, aviso de privacidad y botón de la fixture", () => {
    renderForm(vi.fn());
    for (const label of [
      texts.nameLabel,
      texts.phoneLabel,
      texts.emailLabel,
      texts.travelMonthLabel,
      texts.adultsLabel,
      texts.childrenLabel,
      legal.commercialConsent,
      legal.marketingConsent!,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(input(texts.travelMonthLabel).type).toBe("month");
    expect(input(legal.commercialConsent).checked).toBe(false);
    expect(input(legal.marketingConsent!).checked).toBe(false);
    expect(screen.getByText(legal.privacyNotice)).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.submit })).toBeTruthy();
  });

  it("el aviso de privacidad enlaza a la página legal correspondiente (legalTexts.privacyPageSlug)", () => {
    renderForm(vi.fn());
    const privacyPageSlug = legal.privacyPageSlug;
    const privacyPage = legal.pages.find((page) => page.slug === privacyPageSlug)!;
    const link = screen.getByRole("link", { name: privacyPage.title });
    expect(link.getAttribute("href")).toBe(`/legal/${privacyPageSlug}`);
  });

  it("sin marketingConsent en el pack no muestra esa casilla", () => {
    const instance = withResolvedInstance((c) => {
      delete c.marketPack.legalTexts.marketingConsent;
    });
    renderForm(vi.fn(), formView(instance));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("LeadForm.tsx no tiene textos visibles literales", () => {
    const source = readFileSync(join(HERE, "LeadForm.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Texto JSX entre etiquetas que no sea una expresión `{...}`.
    expect(source.match(/>\s*[^\s<{}()=>&|?:;,"'`.][^<{}\n]*</g) ?? []).toEqual([]);
    expect(source.match(/\b(aria-label|placeholder|title|alt)=["']/g) ?? []).toEqual([]);
  });
});

describe("envío", () => {
  it("cuerpo según LandingLeadInput con atribución de la URL y App Check en la cabecera (#1, #3)", async () => {
    window.history.replaceState(null, "", "/ejemplo?utm_source=fuente-ficticia&utm_campaign=campana-ficticia&fbclid=fbclid-ficticio&gclid=gclid-ficticio");
    const fetchImpl = vi.fn(async () => response(200, { leadId: "lead-ficticio", deduplicated: false }));
    const { getAppCheckToken } = renderForm(fetchImpl);
    fillValid();
    submit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(getAppCheckToken).toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(formView().endpoint);
    expect((init.headers as Record<string, string>)["X-Firebase-AppCheck"]).toBe(TOKEN);
    const body = LandingLeadInput.parse(sentBody(fetchImpl));
    expect(body.consent).toEqual({ contact: true, marketing: false, textVersion: legal.version });
    expect(body.attribution).toMatchObject({
      utmSource: "fuente-ficticia",
      utmCampaign: "campana-ficticia",
      fbclid: "fbclid-ficticio",
      gclid: "gclid-ficticio",
    });
    expect(body).toMatchObject({ landingSlug: formLanding.slug, tourIds: formLanding.tourIds, website: "" });
  });

  it("cada envío genera un eventId UUID v4 nuevo en attribution.eventId (#2)", async () => {
    const fetchImpl = vi.fn(async () => response(429)).mockImplementationOnce(async () => response(429));
    renderForm(fetchImpl);
    fillValid();
    submit();
    await screen.findByText(texts.errorGeneric);
    submit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const ids = [0, 1].map((call) => (sentBody(fetchImpl, call).attribution as { eventId: string }).eventId);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("teléfono sin prefijo válido en phoneDefaultRegion se envía en E.164 (#4)", async () => {
    const fetchImpl = vi.fn(async () => response(200));
    renderForm(fetchImpl);
    fillValid({ phone: FAKE_NATIONAL });
    submit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchImpl).phone).toBe(FAKE_E164);
  });

  it("teléfono inválido muestra errorPhone junto al campo y no envía (#4)", () => {
    const fetchImpl = vi.fn();
    renderForm(fetchImpl);
    fillValid({ phone: "123" });
    submit();
    const phone = input(texts.phoneLabel);
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(describedError(phone)).toBe(texts.errorPhone);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sin la casilla de contacto muestra errorConsent junto a ella y no envía", () => {
    const fetchImpl = vi.fn();
    renderForm(fetchImpl);
    fillValid({ consent: false });
    submit();
    const consent = input(legal.commercialConsent);
    expect(consent.getAttribute("aria-invalid")).toBe("true");
    expect(describedError(consent)).toBe(texts.errorConsent);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["401", async () => response(401)],
    ["429", async () => response(429)],
    ["red caída", async () => Promise.reject(new TypeError("red ficticia caída"))],
  ])("con %s muestra errorGeneric en role=alert sin perder los valores (#3)", async (_case, impl) => {
    renderForm(vi.fn(impl));
    fillValid();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(texts.errorGeneric));
    expect(input(texts.nameLabel).value).toBe("Viajera Ficticia");
    expect(input(texts.phoneLabel).value).toBe(FAKE_NATIONAL);
    expect(input(texts.emailLabel).value).toBe("viajera@example.test");
    expect(input(texts.travelMonthLabel).value).toBe("2027-03");
    expect(input(texts.adultsLabel).value).toBe("2");
    expect(input(legal.commercialConsent).checked).toBe(true);
    const button = screen.getByRole("button", { name: texts.submit }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("con 400 fields muestra cada error junto a su campo (#3)", async () => {
    const fields = ["name", "phone", "email"];
    renderForm(vi.fn(async () => response(400, { error: "validation", fields })));
    fillValid();
    submit();
    await waitFor(() => expect(describedError(input(texts.phoneLabel))).toBe(texts.errorPhone));
    expect(describedError(input(texts.nameLabel))).toBe(texts.errorRequired);
    expect(describedError(input(texts.emailLabel))).toBe(texts.errorEmail);
    expect(input(texts.nameLabel).value).toBe("Viajera Ficticia");
  });

  it("un número de adultos fuera de rango muestra errorInvalid junto al campo (#63)", async () => {
    renderForm(vi.fn(async () => response(200)));
    fillValid();
    fireEvent.change(input(texts.adultsLabel), { target: { value: "0" } });
    submit();
    await waitFor(() => expect(describedError(input(texts.adultsLabel))).toBe(texts.errorInvalid));
  });

  it("mientras envía, el botón muestra submitting y está deshabilitado", async () => {
    let resolve: (r: Response) => void = () => undefined;
    renderForm(vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    fillValid();
    submit();
    const button = (await screen.findByRole("button", { name: texts.submitting })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    resolve(response(200));
    await screen.findByRole("heading", { name: texts.thanksTitle });
  });

  it("con 200 muestra la pantalla de gracias con WhatsApp y el código de campaña (#3)", async () => {
    renderForm(vi.fn(async () => response(200, { leadId: "lead-ficticio", deduplicated: true })));
    fillValid();
    submit();
    expect(await screen.findByRole("heading", { name: texts.thanksTitle })).toBeTruthy();
    expect(screen.getByText(texts.thanksBody)).toBeTruthy();
    const link = screen.getByRole("link", { name: texts.thanksWhatsapp });
    expect(link.getAttribute("href")).toBe(whatsappHref(FAKE_E164, PREFILL));
    expect(link.getAttribute("href")).toContain(encodeURIComponent(PREFILL));
    expect(screen.queryByRole("button", { name: texts.submit })).toBeNull();
  });

  it("sin número de WhatsApp, la pantalla de gracias no muestra el botón", async () => {
    const instance = withResolvedInstance((c) => {
      c.channels.whatsapp.number = "";
    });
    renderForm(vi.fn(async () => response(200)), formView(instance));
    fillValid();
    submit();
    await screen.findByRole("heading", { name: texts.thanksTitle });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("sin PII persistida (#6)", () => {
  it("un envío completo no escribe en localStorage, sessionStorage ni cookies", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState(null, "", "/ejemplo?utm_source=fuente-ficticia&gclid=gclid-ficticio");
    renderForm(vi.fn(async () => response(200)));
    fillValid();
    submit();
    await screen.findByRole("heading", { name: texts.thanksTitle });
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("el código de apps/landings no importa firebase/firestore", () => {
    const root = join(HERE, "..");
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".next"].includes(entry)) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) sources.push(path);
      }
    };
    walk(root);
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.filter((path) => /from\s+["']firebase\/firestore/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("accesibilidad (axe)", () => {
  it("el formulario, con y sin errores, no tiene violaciones serious ni critical", async () => {
    const { container } = renderForm(vi.fn());
    expect(await blockingViolations(container)).toEqual([]);
    submit();
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("la pantalla de gracias no tiene violaciones serious ni critical", async () => {
    const { container } = renderForm(vi.fn(async () => response(200)));
    fillValid();
    submit();
    await screen.findByRole("heading", { name: texts.thanksTitle });
    expect(await blockingViolations(container)).toEqual([]);
  });
});
