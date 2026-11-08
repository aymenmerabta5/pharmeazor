"use client";

import * as React from "react";
import { createFormHook, Field as TanStackField, useForm, useStore } from "@tanstack/react-form";
import {
  AppCheckboxField,
  AppOtpField,
  AppPasswordField,
  AppSelectField,
  AppTextAreaField,
  AppTextField,
} from "../form-fields/index";
import { cn } from "../../lib/utils";
import { useSurfaceTranslations } from "../../lib/translations";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import { fieldContext, formContext } from "./form-context";
import { AppFormSubmitButton } from "./form-submit";
export {
  SubmitButton,
  AppFormSubmitButton,
  type SubmitButtonProps,
  type AppFormSubmitButtonProps,
} from "./form-submit";

export { TanStackField as Field, useForm, useStore };
export { useFieldContext, useFormContext } from "./form-context";

export interface FormController {
  handleSubmit(): Promise<void> | void;
}

export interface FormProps {
  form: FormController;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  className?: string;
}

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function Form({ form, onSubmit, children, className }: FormProps): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  const common = useSurfaceTranslations("common");
  const clientReady = React.useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const inFlight = React.useRef(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitFailed, setSubmitFailed] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    if (!clientReady || inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      const outcomes = await Promise.allSettled([
        Promise.resolve().then(() => form.handleSubmit()),
        Promise.resolve().then(() => onSubmit?.(event)),
      ]);
      setSubmitFailed(outcomes.some((outcome) => outcome.status === "rejected"));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      noValidate
      data-slot="form"
      aria-busy={!clientReady || isSubmitting}
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void submit(event);
      }}
    >
      {!clientReady ? (
        <p role="status" className="text-sm text-muted-foreground">
          {common("formPreparing")}
        </p>
      ) : null}
      <noscript>
        <p className="text-sm text-muted-foreground">{common("formJavaScriptRequired")}</p>
      </noscript>
      <fieldset className="contents" disabled={!clientReady}>
        {children}
        {submitFailed ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle>{t("genericTitle")}</AlertTitle>
            <AlertDescription>{t("genericDescription")}</AlertDescription>
            <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
              {isSubmitting ? common("loading") : t("retry")}
            </Button>
          </Alert>
        ) : null}
      </fieldset>
    </form>
  );
}

export const { extendForm, useAppForm, useTypedAppFormContext, withFieldGroup, withForm } =
  createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
      CheckboxField: AppCheckboxField,
      OtpField: AppOtpField,
      PasswordField: AppPasswordField,
      SelectField: AppSelectField,
      TextAreaField: AppTextAreaField,
      TextField: AppTextField,
    },
    formComponents: {
      SubmitButton: AppFormSubmitButton,
    },
  });
