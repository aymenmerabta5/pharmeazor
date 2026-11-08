"use client";
import { useForm as useAppForm } from "@tanstack/react-form";
import { createRequiredPasswordSchema, createTotpSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSettingsIdentityQuery } from "./queries";
import { useTwoFactorMutation } from "./mutations";

export function useTwoFactorSettings() {
  const t = useSurfaceTranslations("settings");
  const serverEnabled = useSettingsIdentityQuery().twoFactorEnabled;
  const prepare = useTwoFactorMutation();
  const complete = useTwoFactorMutation();
  const enabled =
    complete.data?.kind === "complete" && complete.variables?.previousEnabled === serverEnabled
      ? complete.data.enabled
      : serverEnabled;
  const challenge = !enabled && prepare.data?.kind === "challenge" ? prepare.data : null;
  const passwordSchema = createRequiredPasswordSchema(t("validation.passwordRequired"));
  const enableForm = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      await prepare.run({ kind: "enable", password: value.password });
    },
  });
  const verifyForm = useAppForm({
    defaultValues: { code: "" },
    validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) },
    onSubmit: async ({ value }) => {
      const result = await complete.run({
        kind: "verify",
        code: value.code,
        previousEnabled: serverEnabled,
      });
      if (result.status !== "success" || !result.isCurrent()) return;
      verifyForm.reset();
      enableForm.reset();
      prepare.reset();
    },
  });
  const disableForm = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      const result = await complete.run({
        kind: "disable",
        password: value.password,
        previousEnabled: serverEnabled,
      });
      if (result.status !== "success" || !result.isCurrent()) return;
      disableForm.reset();
      prepare.reset();
    },
  });
  return {
    backupCodes: challenge?.backupCodes ?? null,
    totpUri: challenge?.totpUri ?? null,
    enabled,
    enableForm,
    verifyForm,
    disableForm,
    error: complete.error
      ? t(complete.variables?.kind === "verify" ? "errors.invalidCode" : "errors.twoFactorDisable")
      : prepare.error
        ? t("errors.twoFactorEnable")
        : null,
  };
}
export type TwoFactorSettings = ReturnType<typeof useTwoFactorSettings>;
