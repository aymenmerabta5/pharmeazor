"use client";
import * as React from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { TOPUP_PRESETS, formatManualAmount } from "../model";
import type { ManualPaymentFormState } from "../types";

/**
 * The amount the customer transferred.
 *
 * It is free text rather than a plan list: a top-up is credit, so any amount
 * inside the rail's range is valid. The presets only save typing.
 */
export function TopupAmountField({
  form,
  pending,
}: {
  form: ManualPaymentFormState["form"];
  pending: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const id = React.useId();
  return (
    <form.AppField name="amount">
      {(field) => {
        const invalid = field.state.meta.errors.length > 0;
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={id}>{t("manualAmount")}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={id}
                inputMode="decimal"
                autoComplete="off"
                placeholder={t("manualAmountPlaceholder")}
                value={field.state.value}
                disabled={pending}
                aria-invalid={invalid}
                aria-describedby={id + "-help"}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="h-12 text-lg tabular-nums"
              />
              <InputGroupAddon className="pe-3 text-sm font-medium">DA</InputGroupAddon>
            </InputGroup>
            <div className="flex flex-wrap gap-2" aria-label={t("manualAmountPresets")}>
              {TOPUP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={pending}
                  onClick={() => field.handleChange(String(preset / 100))}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-control transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {formatManualAmount(preset, locale)}
                </button>
              ))}
            </div>
            <p id={id + "-help"} className="text-sm leading-6 text-muted-foreground">
              {t("manualAmountHelp")}
            </p>
            {invalid ? <FieldError>{t("manualAmountInvalid")}</FieldError> : null}
          </Field>
        );
      }}
    </form.AppField>
  );
}
