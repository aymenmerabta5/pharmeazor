import type * as React from "react";
import { useForgotPasswordForm } from "./use-forgot-password-form";
import { ForgotPasswordForm } from "./components/forgot-password-form";
export function ForgotPasswordScreen(): React.JSX.Element {
  const state = useForgotPasswordForm();
  return <ForgotPasswordForm state={state} />;
}
