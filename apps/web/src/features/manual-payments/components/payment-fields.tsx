"use client";
import * as React from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatManualAmount } from "../model";
import type { ManualPaymentFormState } from "../types";

type ManualPaymentFieldsProps = Pick<
  ManualPaymentFormState,
  "form" | "fileInput" | "methods" | "receiverInstructions" | "plans"
>;

export function ManualPaymentFields({
  form,
  fileInput,
  methods,
  receiverInstructions,
  plans,
}: ManualPaymentFieldsProps): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const id = React.useId();
  return (
    <>
      <div
        className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm leading-6"
        aria-label={t("manualInstructions")}
      >
        {receiverInstructions}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{t("manualInstructionsHelp")}</p>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <>
            <form.AppField name="planId">
              {(field) => (
                <fieldset className="flex flex-col gap-2" aria-label={t("choosePlan")}>
                  <legend className="text-sm font-medium">{t("choosePlan")}</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {plans.map((plan) => (
                      <label
                        key={plan.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                          field.state.value === plan.id
                            ? "border-primary bg-primary/[0.04]"
                            : "border-border"
                        }`}
                      >
                        <input
                          type="radio"
                          name="manual-plan"
                          value={plan.id}
                          checked={field.state.value === plan.id}
                          disabled={pending}
                          onBlur={field.handleBlur}
                          onChange={() => field.handleChange(plan.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-medium">{plan.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatManualAmount(plan.priceMinor, locale)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {field.state.meta.errors.length > 0 ? (
                    <FieldError>{t("manualAmountInvalid")}</FieldError>
                  ) : null}
                </fieldset>
              )}
            </form.AppField>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="method">
                {(field) => (
                  <field.SelectField
                    label={t("manualMethod")}
                    options={methods.map((value) => ({ label: value, value }))}
                    disabled={pending}
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="reference">
              {(field) => (
                <field.TextField label={t("manualReference")} maxLength={160} disabled={pending} />
              )}
            </form.AppField>
            <form.AppField name="receipt">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={id}>{t("manualReceipt")}</FieldLabel>
                  <Input
                    ref={fileInput}
                    id={id}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    disabled={pending}
                    required
                    aria-describedby={id + "-help"}
                    aria-invalid={field.state.meta.errors.length > 0}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.files?.[0] ?? null)}
                  />
                  <p id={id + "-help"} className="text-sm text-muted-foreground">
                    {t("manualReceiptHelp")}
                  </p>
                  {field.state.meta.errors.length > 0 ? (
                    <FieldError>{t("manualReceiptInvalid")}</FieldError>
                  ) : null}
                </Field>
              )}
            </form.AppField>
          </>
        )}
      </form.Subscribe>
    </>
  );
}
