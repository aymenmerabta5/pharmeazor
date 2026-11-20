"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createSignUpSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { signUpWithEmail } from "./mutations";
import { useAuthCaptcha } from "./use-auth-captcha";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthMethods } from "./use-auth-methods";
import { useAuthNavigation } from "./use-auth-navigation";

export function useSignUpForm() {
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const t = useSurfaceTranslations("auth");
  const captcha = useAuthCaptcha();
  const [error, setError] = useState<string | null>(null);
  const methods = useAuthMethods(intent, "signUp", () => setError(null));
  const form = useAppForm({
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
      if (captcha.enabled && !captcha.token) {
        setError(t("captcha.required"));
        return;
      }
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      methods.reset();
      try {
        const result = await signUpWithEmail({
          ...value,
          captchaToken: captcha.token ?? undefined,
        });
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("signUp.genericError"));
          return;
        }
        await navigation.afterSignUp(Boolean(result.data?.token));
      } catch {
        if (ticket.isCurrent()) setError(t("signUp.genericError"));
      } finally {
        captcha.reset();
        ticket.finish();
      }
    },
  });
  return { form, error: error ?? methods.error, methods, captcha };
}
