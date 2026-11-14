"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { FieldGroup } from "@/components/ui/field";
import { useSurfaceTranslations } from "@/lib/translations";
import type { PaymentLinkFormState } from "../types";

export function BillingPaymentLinkView({
  state,
}: {
  state: PaymentLinkFormState;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { form, allowed, error, url, plans } = state;
  if (!allowed) return <p className="text-sm text-muted-foreground">{t("adminPaymentLinks")}</p>;
  return (
    <form.AppForm>
      <Form form={form} className="flex flex-col gap-3">
        <FieldGroup>
          <form.AppField name="name">
            {(field) => <field.TextField label={t("paymentLinkName")} maxLength={120} required />}
          </form.AppField>
          <form.AppField name="planId">
            {(field) => (
              <field.SelectField
                label={t("plan")}
                options={plans.map((plan) => ({ label: plan.name, value: plan.id }))}
              />
            )}
          </form.AppField>
        </FieldGroup>
        <form.SubmitButton variant="outline">{t("createPaymentLink")}</form.SubmitButton>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {url ? (
          <a className="break-all text-sm underline" href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        ) : null}
      </Form>
    </form.AppForm>
  );
}
