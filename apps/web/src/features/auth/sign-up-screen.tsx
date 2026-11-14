"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSignUpForm } from "./use-sign-up-form";
import { AuthShell } from "./components/auth-shell";
import { SignUpForm } from "./components/sign-up-form";

export function SignUpScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = useSignUpForm();
  return (
    <AuthShell backLabel={t("signUp.backHome")} note={t("signUp.securityNote")}>
      <SignUpForm state={state} />
    </AuthShell>
  );
}
