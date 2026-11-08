"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { FieldMessages, fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface CheckboxFieldProps {
  checked?: boolean;
  className?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  error?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  name?: string;
  onBlur?: React.ComponentPropsWithoutRef<typeof Checkbox>["onBlur"];
  onCheckedChange?: (checked: boolean) => void;
  ref?: React.Ref<HTMLButtonElement>;
  required?: boolean;
  value?: string;
}

export function CheckboxField({
  checked,
  className,
  description,
  disabled,
  error,
  id,
  label,
  name,
  onBlur,
  onCheckedChange,
  ref,
  required,
  value,
}: CheckboxFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field
      className={className}
      orientation="horizontal"
      data-disabled={disabled || undefined}
      data-invalid={invalid}
    >
      <Checkbox
        ref={ref}
        id={ids.controlId}
        name={name}
        value={value}
        checked={checked}
        required={required}
        disabled={disabled}
        onBlur={onBlur}
        onCheckedChange={onCheckedChange}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-errormessage={invalid ? ids.errorId : undefined}
      />
      {label || description || error ? (
        <FieldContent>
          {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
          <FieldMessages
            description={description}
            descriptionId={ids.descriptionId}
            error={error}
            errorId={ids.errorId}
          />
        </FieldContent>
      ) : null}
    </Field>
  );
}

export type AppCheckboxFieldProps = Omit<
  CheckboxFieldProps,
  "checked" | "error" | "name" | "onBlur" | "onCheckedChange"
>;

export function AppCheckboxField(props: AppCheckboxFieldProps): React.JSX.Element {
  const field = useFieldContext<boolean>();
  return (
    <CheckboxField
      {...props}
      name={field.name}
      checked={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onCheckedChange={field.handleChange}
    />
  );
}
