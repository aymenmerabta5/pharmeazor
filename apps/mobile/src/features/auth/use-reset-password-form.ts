"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createResetPasswordSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { resetPassword } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthNavigation } from "./use-auth-navigation";

export function useResetPasswordForm(token: string, queryError: string | null) {
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const linkError = queryError
    ? queryError === "INVALID_TOKEN"
      ? t("resetPassword.expiredToken")
      : t("resetPassword.genericError")
    : token
      ? null
      : t("resetPassword.missingToken");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: {
      onSubmit: createResetPasswordSchema({
        passwordRequired: authT("validation.passwordRequired"),
        passwordTooShort: authT("validation.passwordTooShort"),
        passwordTooLong: authT("validation.passwordTooLong"),
        passwordMismatch: t("resetPassword.passwordMismatch"),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!token) return;
      const ticket = intent.begin();
      if (!ticket) return;
      setSubmissionError(null);
      try {
        const result = await resetPassword({ newPassword: value.newPassword, token });
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setSubmissionError(t("resetPassword.genericError"));
          return;
        }
        await navigation.afterPasswordReset();
      } catch {
        if (ticket.isCurrent()) setSubmissionError(t("resetPassword.genericError"));
      } finally {
        ticket.finish();
      }
    },
  });
  return { form, token, error: submissionError ?? linkError };
}
