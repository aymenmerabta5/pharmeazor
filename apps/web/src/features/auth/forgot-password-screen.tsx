"use client";
import type * as React from "react";
import { useForgotPasswordForm } from "./use-forgot-password-form";
import { ForgotPasswordView } from "./components/forgot-password-form";
export function ForgotPasswordScreen(): React.JSX.Element {
  const state = useForgotPasswordForm();
  return <ForgotPasswordView state={state} />;
}
