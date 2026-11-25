"use client";
import { useForm as useAppForm } from "@tanstack/react-form";
import { createRequiredPasswordSchema } from "@/lib/auth-validation";
import { useRouter } from "expo-router";
import { useSurfaceTranslations } from "@/lib/translations";
import { isIdentityRecentAuthenticationError } from "@/lib/auth-model";
import { identityErrorCode } from "./model";
import { useDeleteAccountMutation } from "./mutations";
export function useAccountDeletion() {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const mutation = useDeleteAccountMutation(() => {
    form.reset();
    router.replace("/");
  });
  const error = !mutation.error
    ? null
    : identityErrorCode(mutation.error) === "ACCOUNT_DELETION_RESTRICTED"
      ? t("danger.retainedRecordError")
      : isIdentityRecentAuthenticationError(mutation.error.cause)
        ? t("danger.reauthenticate")
        : identityErrorCode(mutation.error) === "INVALID_PASSWORD"
          ? t("danger.invalidPassword")
          : t("danger.genericError");

  const form = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: createRequiredPasswordSchema(t("validation.passwordRequired")) },
    onSubmit: async ({ value }) => {
      await mutation.run(value.password);
    },
  });

  return { form, error, pending: mutation.pending };
}
export type AccountDeletion = ReturnType<typeof useAccountDeletion>;
