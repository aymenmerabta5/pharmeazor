"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { useSurfaceTranslations } from "@/lib/translations";
import { FieldMessages, fieldDescriptionIds, firstFieldError, useFieldIds } from "./field-helpers";

export interface PasswordFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className" | "type"
> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function PasswordField({
  label,
  error,
  description,
  className,
  id,
  disabled,
  ref,
  ...props
}: PasswordFieldProps): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  const [show, setShow] = React.useState(false);
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-invalid={invalid} data-disabled={disabled || undefined}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <InputGroup data-disabled={disabled || undefined}>
        <InputGroupInput
          {...props}
          id={ids.controlId}
          ref={ref}
          type={show ? "text" : "password"}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        />
        <InputGroupAddon>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-controls={ids.controlId}
            aria-label={show ? t("hidePassword") : t("showPassword")}
            aria-pressed={show}
            onClick={() => setShow((visible) => !visible)}
          >
            {show ? (
              <EyeOff data-icon="inline-start" aria-hidden />
            ) : (
              <Eye data-icon="inline-start" aria-hidden />
            )}
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <FieldMessages
        description={description}
        descriptionId={ids.descriptionId}
        error={error}
        errorId={ids.errorId}
      />
    </Field>
  );
}

export type AppPasswordFieldProps = Omit<
  PasswordFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppPasswordField(props: AppPasswordFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <PasswordField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
