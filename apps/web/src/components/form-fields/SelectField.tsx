"use client";

import * as React from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface SelectFieldOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectFieldProps {
  className?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  error?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onValueChange?: (value: string) => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
  ref?: React.Ref<HTMLButtonElement>;
  value?: string;
}

export function SelectField({
  className,
  description,
  disabled,
  error,
  id,
  label,
  name,
  onBlur,
  onValueChange,
  options,
  placeholder,
  ref,
  value,
}: SelectFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <Select
        items={options}
        name={name}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder={placeholder}
      >
        <SelectTrigger
          ref={ref}
          id={ids.controlId}
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={ids.errorId}>{error}</FieldError> : null}
    </Field>
  );
}

export type AppSelectFieldProps = Omit<
  SelectFieldProps,
  "error" | "name" | "onBlur" | "onValueChange" | "value"
>;

export function AppSelectField(props: AppSelectFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <SelectField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onValueChange={field.handleChange}
    />
  );
}
