"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createAppCheckTokenGetter, type GetAppCheckToken } from "../lib/app-check.js";
import {
  ADULTS,
  buildLeadBody,
  CHILDREN,
  EMPTY_LEAD_FORM_VALUES,
  submitLead,
  validateLeadForm,
  type LeadFormErrors,
  type LeadFormField,
  type LeadFormValues,
  type LeadFormView,
} from "../lib/lead-form.js";

export interface LeadFormProps extends LeadFormView {
  /** Inyectable en tests; por defecto, App Check perezoso (`lib/app-check.ts`). */
  getAppCheckToken?: GetAppCheckToken;
  /** Inyectable en tests; por defecto, el `fetch` global. */
  fetchImpl?: typeof fetch;
}

type Status = "idle" | "submitting" | "done";

const FIELD_ORDER: LeadFormField[] = ["name", "phone", "email", "travelMonth", "adults", "children", "consentContact"];

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-400 px-3 py-2 text-base aria-[invalid=true]:border-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400";
const errorClass = "mt-1 text-sm text-red-800";

/**
 * Formulario de lead: valida en cliente, envía a `ingestLandingLead` con App
 * Check y muestra la pantalla de gracias. Todos los textos llegan por props
 * (pack de mercado e instancia). Los valores solo viven en el estado de React.
 */
export function LeadForm(props: LeadFormProps) {
  const { texts, legal, privacyPage, endpoint, landingSlug, tourIds, phoneDefaultRegion, whatsappHref } = props;
  const baseId = useId();
  const idOf = (field: LeadFormField | "website" | "marketing" | "privacy" | "thanks") => `${baseId}-${field}`;
  const errorIdOf = (field: LeadFormField) => `${baseId}-${field}-error`;

  const [values, setValues] = useState<LeadFormValues>(EMPTY_LEAD_FORM_VALUES);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [generic, setGeneric] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const honeypot = useRef<HTMLInputElement>(null);
  const thanksHeading = useRef<HTMLHeadingElement>(null);

  const { getAppCheckToken: injectedGetter, appCheck } = props;
  const getAppCheckToken = useMemo(
    () => injectedGetter ?? createAppCheckTokenGetter(appCheck),
    [injectedGetter, appCheck],
  );

  useEffect(() => {
    if (status === "done") thanksHeading.current?.focus();
  }, [status]);

  function focusFirstError(fields: LeadFormErrors) {
    const first = FIELD_ORDER.find((field) => fields[field] !== undefined);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  function update(field: keyof LeadFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const { type, checked, value } = event.target;
      setValues((current) => ({ ...current, [field]: type === "checkbox" ? checked : value }));
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setGeneric(false);
    const { fields } = validateLeadForm(values, { phoneDefaultRegion, texts });
    setErrors(fields);
    if (Object.keys(fields).length > 0) {
      focusFirstError(fields);
      return;
    }

    setStatus("submitting");
    const body = buildLeadBody(
      { ...values, website: honeypot.current?.value ?? "" },
      {
        landingSlug,
        tourIds,
        legalTexts: legal,
        phoneDefaultRegion,
        searchParams: new URLSearchParams(window.location.search),
        eventId: crypto.randomUUID(),
      },
    );
    const result = await submitLead(body, {
      endpoint,
      getAppCheckToken,
      texts,
      ...(props.fetchImpl ? { fetch: props.fetchImpl } : {}),
    });
    if (result.ok) {
      setStatus("done");
      return;
    }
    setStatus("idle");
    const serverFields = result.fields ?? {};
    setErrors(serverFields);
    setGeneric(result.generic === true);
    focusFirstError(serverFields);
  }

  if (status === "done") {
    return (
      <section aria-labelledby={idOf("thanks")} className="px-4 py-10 text-center sm:px-6">
        <h2 id={idOf("thanks")} ref={thanksHeading} tabIndex={-1} className="text-2xl font-bold">
          {texts.thanksTitle}
        </h2>
        <p className="mt-3">{texts.thanksBody}</p>
        {whatsappHref !== undefined ? (
          <a
            href={whatsappHref}
            className="mt-6 inline-block rounded-full bg-brand px-8 py-4 text-lg font-semibold text-white shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400"
          >
            {texts.thanksWhatsapp}
          </a>
        ) : null}
      </section>
    );
  }

  const submitting = status === "submitting";
  const fieldProps = (field: LeadFormField) => ({
    id: idOf(field),
    "aria-invalid": errors[field] !== undefined,
    ...(errors[field] !== undefined ? { "aria-describedby": errorIdOf(field) } : {}),
  });
  const fieldError = (field: LeadFormField) =>
    errors[field] !== undefined ? (
      <p id={errorIdOf(field)} className={errorClass}>
        {errors[field]}
      </p>
    ) : null;
  const textField = (
    field: "name" | "phone" | "email" | "travelMonth" | "adults" | "children",
    label: string,
    input: { type: string; autoComplete?: string; inputMode?: "numeric"; min?: number; max?: number; required?: boolean },
  ) => (
    <div>
      <label htmlFor={idOf(field)} className="block font-medium">
        {label}
      </label>
      <input
        {...fieldProps(field)}
        {...input}
        name={field}
        value={values[field]}
        onChange={update(field)}
        className={inputClass}
      />
      {fieldError(field)}
    </div>
  );

  return (
    <section className="px-4 py-10 sm:px-6">
      <form noValidate onSubmit={onSubmit} className="mx-auto grid max-w-xl gap-4">
        {textField("name", texts.nameLabel, { type: "text", autoComplete: "name", required: true })}
        {textField("phone", texts.phoneLabel, { type: "tel", autoComplete: "tel", required: true })}
        {textField("email", texts.emailLabel, { type: "email", autoComplete: "email" })}
        {textField("travelMonth", texts.travelMonthLabel, { type: "month" })}
        <div className="grid grid-cols-2 gap-4">
          {textField("adults", texts.adultsLabel, { type: "number", inputMode: "numeric", ...ADULTS })}
          {textField("children", texts.childrenLabel, { type: "number", inputMode: "numeric", ...CHILDREN })}
        </div>

        <div>
          <div className="flex items-start gap-2">
            <input
              {...fieldProps("consentContact")}
              type="checkbox"
              name="consentContact"
              checked={values.consentContact}
              onChange={update("consentContact")}
              required
              className="mt-1 h-5 w-5"
            />
            <label htmlFor={idOf("consentContact")}>{legal.commercialConsent}</label>
          </div>
          {fieldError("consentContact")}
        </div>
        {legal.marketingConsent !== undefined && legal.marketingConsent.trim() !== "" ? (
          <div className="flex items-start gap-2">
            <input
              id={idOf("marketing")}
              type="checkbox"
              name="consentMarketing"
              checked={values.consentMarketing}
              onChange={update("consentMarketing")}
              className="mt-1 h-5 w-5"
            />
            <label htmlFor={idOf("marketing")}>{legal.marketingConsent}</label>
          </div>
        ) : null}
        <p id={idOf("privacy")} className="text-sm text-gray-700">
          {legal.privacyNotice}
        </p>
        <p className="text-sm text-gray-700">
          <a href={`/legal/${privacyPage.slug}`} className="underline">
            {privacyPage.title}
          </a>
        </p>

        {/* Honeypot: invisible para personas y tecnologías de apoyo. */}
        <div aria-hidden="true" style={{ display: "none" }}>
          <input ref={honeypot} id={idOf("website")} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div role="alert" className="text-red-800">
          {generic ? texts.errorGeneric : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-brand px-8 py-4 text-lg font-semibold text-white shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 disabled:opacity-70"
        >
          {submitting ? texts.submitting : texts.submit}
        </button>
      </form>
    </section>
  );
}
