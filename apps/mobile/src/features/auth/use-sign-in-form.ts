"use client";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createSignInSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { signInWithEmail } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthMethods } from "./use-auth-methods";
import { useAuthNavigation } from "./use-auth-navigation";

export function useSignInForm() {
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const methods = useAuthMethods(intent, navigation.dashboard, "signIn", () => setError(null));
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onSubmit: createSignInSchema({
        invalidEmail: t("validation.invalidEmail"),
        passwordRequired: t("validation.passwordRequired"),
        passwordTooShort: t("validation.passwordTooShort"),
        passwordTooLong: t("validation.passwordTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      methods.reset();
      try {
        const result = await signInWithEmail(value);
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("signIn.genericError"));
          return;
        }
        const data = result.data;
        const twoFactor =
          typeof data === "object" &&
          data !== null &&
          "twoFactorRedirect" in data &&
          data.twoFactorRedirect === true;
        await navigation.afterSignIn(twoFactor);
      } catch {
        if (ticket.isCurrent()) setError(t("signIn.genericError"));
      } finally {
        ticket.finish();
      }
    },
  });
  return { form, error, methods };
}
