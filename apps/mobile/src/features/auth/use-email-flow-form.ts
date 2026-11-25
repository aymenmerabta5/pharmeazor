"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createEmailSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { requestMagicLink, requestEmailVerification } from "./mutations";
import { useAuthCaptcha } from "./use-auth-captcha";
import { useAuthIntent } from "./use-auth-intent";

export function useEmailFlowForm(kind: "magic-link" | "verify-email") {
  const t = useSurfaceTranslations("auth");
  const intent = useAuthIntent();
  const captcha = useAuthCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(t("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      if (captcha.enabled && !captcha.token) {
        setError(t("captcha.required"));
        return;
      }
      const ticket = intent.begin();
      if (!ticket) return;
      setError(null);
      setSent(false);
      try {
        const result = await (kind === "magic-link"
          ? requestMagicLink(value.email, captcha.token ?? undefined)
          : requestEmailVerification(value.email, captcha.token ?? undefined));
        if (!ticket.isCurrent()) return;
        if (result.error) {
          setError(t("emailFlow.sendError"));
          return;
        }
        setSent(true);
      } catch {
        if (ticket.isCurrent()) setError(t("emailFlow.sendError"));
      } finally {
        captcha.reset();
        ticket.finish();
      }
    },
  });
  return { form, error, sent, captcha };
}
