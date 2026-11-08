import type * as React from "react";
import { useResetPasswordForm } from "./use-reset-password-form";
import { ResetPasswordForm } from "./components/reset-password-form";
export function ResetPasswordScreen({
  token,
  queryError,
}: {
  token: string;
  queryError: string | null;
}): React.JSX.Element {
  const state = useResetPasswordForm(token, queryError);
  return <ResetPasswordForm state={state} />;
}
