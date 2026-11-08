"use client";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createTwoFactorChallengeSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { verifyAuthChallenge } from "./mutations";
import { useAuthIntent } from "./use-auth-intent";
import { useAuthNavigation } from "./use-auth-navigation";

export function useTwoFactorForm() {
  const t = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const navigation = useAuthNavigation();
  const [error, setError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const form = useForm({
    defaultValues: { code: "", trustDevice: false },
    validators: {
      onSubmit: createTwoFactorChallengeSchema(
        useBackupCode ? "backup" : "authenticator",
        t(useBackupCode ? "twoFactor.backupCodeDescription" : "validation.codeSixDigits"),
      ),
    },
    onSubmit: async ({ value }) => {
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      try {
        const result = await verifyAuthChallenge(useBackupCode ? "backup" : "authenticator", {
          code: value.code.trim(),
          trustDevice: false,
        });
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("twoFactor.genericError"));
          return;
        }
        await navigation.dashboard();
      } catch {
        if (ticket.isCurrent()) setError(t("twoFactor.genericError"));
      } finally {
        ticket.finish();
      }
    },
  });
  function toggleMethod(): void {
    if (form.state.isSubmitting) return;
    setUseBackupCode((value) => !value);
    setError(null);
    form.reset();
  }
  return { form, error, useBackupCode, toggleMethod };
}
