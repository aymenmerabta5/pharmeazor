"use client";
import { useAppForm } from "@/components/ui/form";
import { createChangePasswordSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";
import { toast } from "sonner";
import { useChangePasswordMutation } from "./mutations";

export function usePasswordForm() {
  const t = useSurfaceTranslations("settings");
  const mutation = useChangePasswordMutation();
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: {
      onSubmit: createChangePasswordSchema({
        currentPasswordRequired: t("validation.currentPasswordRequired"),
        passwordRequired: t("validation.passwordRequired"),
        passwordTooShort: t("validation.passwordTooShort"),
        passwordTooLong: t("validation.passwordTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      const result = await mutation.run(value);
      if (result.status !== "success" || !result.isCurrent()) return;
      form.reset();
      toast.success(t("password.successTitle"), { description: t("password.successMessage") });
    },
  });
  return {
    form,
    error: mutation.error ? t("errors.passwordUpdate") : null,
    success: mutation.isSuccess,
  };
}
export type PasswordForm = ReturnType<typeof usePasswordForm>;
