"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Input } from "@/components/ui/input";
import { FieldMessages, fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface TextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, description, disabled, error, id, label, ...props }, ref) => {
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
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        />
        <FieldMessages
          description={description}
          descriptionId={ids.descriptionId}
          error={error}
          errorId={ids.errorId}
        />
      </Field>
    );
  },
);
TextField.displayName = "TextField";

export type AppTextFieldProps = Omit<
  TextFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppTextField(props: AppTextFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <TextField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
