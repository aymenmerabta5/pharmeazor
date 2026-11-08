"use client";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createEmailSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { requestPasswordReset } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";

export function useForgotPasswordForm() {
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(authT("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      setSuccess(false);
      try {
        const result = await requestPasswordReset(value.email);
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("forgotPassword.genericError"));
          return;
        }
        setSuccess(true);
        form.reset();
      } catch {
        if (ticket.isCurrent()) setError(t("forgotPassword.genericError"));
      } finally {
        ticket.finish();
      }
    },
  });
  return { form, success, error };
}
