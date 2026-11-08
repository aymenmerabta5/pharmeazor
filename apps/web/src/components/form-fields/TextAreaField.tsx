"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Textarea } from "@/components/ui/textarea";
import { FieldMessages, fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface TextAreaFieldProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ className, description, disabled, error, id, label, ...props }, ref) => {
    const ids = useFieldIds(id);
    const invalid = Boolean(error);
    const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
    return (
      <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
        {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
        <Textarea
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
TextAreaField.displayName = "TextAreaField";

export type AppTextAreaFieldProps = Omit<
  TextAreaFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppTextAreaField(props: AppTextAreaFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <TextAreaField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
