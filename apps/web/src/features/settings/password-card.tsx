"use client";
import type * as React from "react";
import { usePasswordForm } from "./use-password-form";
import { PasswordView } from "./components/password-view";
export function PasswordCard(): React.JSX.Element {
  const model = usePasswordForm();
  return <PasswordView model={model} />;
}
