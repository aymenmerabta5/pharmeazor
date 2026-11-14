"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSignInForm } from "./use-sign-in-form";
import { AuthShell } from "./components/auth-shell";
import { SignInForm } from "./components/sign-in-form";

export function SignInScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = useSignInForm();
  return (
    <AuthShell backLabel={t("signIn.backHome")} note={t("signIn.securityNote")}>
      <SignInForm state={state} />
    </AuthShell>
  );
}
