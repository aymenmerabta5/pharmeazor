import type * as React from "react";
import { NativeFormField } from "@/components/form-fields/native-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
interface FieldState {
  state: { value: string; meta: { errors: readonly unknown[] } };
  handleChange(value: string): void;
  handleBlur(): void;
}
export function SettingsField({
  field,
  label,
  secureTextEntry = false,
}: {
  field: FieldState;
  label: string;
  secureTextEntry?: boolean;
}): React.JSX.Element {
  return (
    <NativeFormField
      value={field.state.value}
      label={label}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      errors={field.state.meta.errors}
      secureTextEntry={secureTextEntry}
      autoCapitalize={secureTextEntry ? "none" : "sentences"}
    />
  );
}
export function SettingsFeedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string;
}): React.JSX.Element | null {
  return error || success ? (
    <Alert accessibilityRole="alert" variant={error ? "destructive" : "default"}>
      <AlertDescription>{error ?? success}</AlertDescription>
    </Alert>
  ) : null;
}
