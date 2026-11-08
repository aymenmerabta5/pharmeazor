"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Input } from "@/components/ui/input";
import { FieldMessages, fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface OtpFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className" | "maxLength" | "onChange" | "type" | "value"
> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
  length?: number;
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
  value?: string;
}

export function OtpField({
  autoComplete = "one-time-code",
  className,
  description,
  disabled,
  error,
  id,
  inputMode = "numeric",
  label,
  length = 6,
  onValueChange,
  pattern = "[0-9]*",
  ref,
  value,
  ...props
}: OtpFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <Input
        {...props}
        ref={ref}
        id={ids.controlId}
        type="text"
        inputMode={inputMode}
        pattern={pattern}
        autoComplete={autoComplete}
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-errormessage={invalid ? ids.errorId : undefined}
        className="font-mono text-center tracking-[0.32em]"
      />
      <FieldMessages
        description={description}
        descriptionId={ids.descriptionId}
        error={error}
        errorId={ids.errorId}
      />
    </Field>
  );
}

export type AppOtpFieldProps = Omit<
  OtpFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onValueChange" | "value"
>;

export function AppOtpField(props: AppOtpFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <OtpField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onValueChange={field.handleChange}
    />
  );
}
