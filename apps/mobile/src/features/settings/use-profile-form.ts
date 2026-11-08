"use client";
import { useForm as useAppForm } from "@tanstack/react-form";
import { createProfileSchema } from "@/lib/auth-validation";
import { useSurfaceTranslations } from "@/lib/translations";

import { useSettingsIdentityRefresh, useUpdateProfileMutation } from "./mutations";

export function useProfileForm(initialName: string) {
  const t = useSurfaceTranslations("settings");

  const mutation = useUpdateProfileMutation();
  const refreshSettingsIdentity = useSettingsIdentityRefresh();
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: {
      onSubmit: createProfileSchema({
        nameRequired: t("validation.nameRequired"),
        nameTooShort: t("validation.nameTooShort"),
        nameTooLong: t("validation.nameTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      const result = await mutation.run(value);
      if (result.status !== "success" || !result.isCurrent()) return;

      refreshSettingsIdentity();
    },
  });
  return {
    form,
    error: mutation.error ? t("errors.profileUpdate") : null,
    success: mutation.isSuccess,
  };
}
export type ProfileForm = ReturnType<typeof useProfileForm>;
