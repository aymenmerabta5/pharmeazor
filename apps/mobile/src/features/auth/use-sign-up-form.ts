"use client";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createSignUpSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { signUpWithEmail } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthMethods } from "./use-auth-methods";
import { useAuthNavigation } from "./use-auth-navigation";

export function useSignUpForm() {
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const methods = useAuthMethods(intent, navigation.dashboard, "signUp", () => setError(null));
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: {
      onSubmit: createSignUpSchema({
        invalidEmail: t("validation.invalidEmail"),
        passwordRequired: t("validation.passwordRequired"),
        passwordTooShort: t("validation.passwordTooShort"),
        passwordTooLong: t("validation.passwordTooLong"),
        nameRequired: t("validation.nameRequired"),
        nameTooShort: t("validation.nameTooShort"),
        nameTooLong: t("validation.nameTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      methods.reset();
      try {
        const result = await signUpWithEmail(value);
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("signUp.genericError"));
          return;
        }
        await navigation.afterSignUp(Boolean(result.data?.token));
      } catch {
        if (ticket.isCurrent()) setError(t("signUp.genericError"));
      } finally {
        ticket.finish();
      }
    },
  });
  return { form, error: error ?? methods.error, methods };
}
