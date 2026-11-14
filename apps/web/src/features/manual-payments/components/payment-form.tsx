"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ManualPaymentFormState } from "../types";
import { ManualPaymentFields } from "./payment-fields";

export function ManualPaymentFormView({
  state,
}: {
  state: ManualPaymentFormState;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { form, enabled, error, submitted } = state;
  if (!enabled)
    return (
      <Alert>
        <AlertDescription>{t("manualUnavailable")}</AlertDescription>
      </Alert>
    );
  return (
    <form.AppForm>
      <Form form={form} className="flex flex-col gap-5">
        <ManualPaymentFields
          form={form}
          fileInput={state.fileInput}
          methods={state.methods}
          receiverInstructions={state.receiverInstructions}
          plans={state.plans}
        />
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {submitted ? (
          <Alert role="status">
            <AlertDescription>{t("manualSubmitted")}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <form.SubmitButton pendingLabel={t("manualSubmitting")}>
            {t("manualSubmit")}
          </form.SubmitButton>
        </div>
      </Form>
    </form.AppForm>
  );
}
