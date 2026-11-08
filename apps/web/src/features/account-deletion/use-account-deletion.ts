"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createRequiredPasswordSchema } from "@/lib/auth-validation";
import { useRouter } from "next/navigation";
import { useSurfaceTranslations } from "@/lib/translations";
import { isIdentityRecentAuthenticationError } from "@/lib/auth-model";
import { identityErrorCode } from "./model";
import { useDeleteAccountMutation } from "./mutations";
export function useAccountDeletion() {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const mutation = useDeleteAccountMutation(() => {
    form.reset();
    setOpen(false);
    router.push("/");
    router.refresh();
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
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: createRequiredPasswordSchema(t("validation.passwordRequired")) },
    onSubmit: async ({ value }) => {
      await mutation.run(value.password);
    },
  });
  const onOpenChange = (value: boolean) => {
    if (mutation.pending) return;
    setOpen(value);
    if (!value) {
      form.reset();
      mutation.reset();
    }
  };
  const cancel = () => {
    if (!mutation.pending) setOpen(false);
  };
  return { form, open, onOpenChange, cancel, error, pending: mutation.pending };
}
export type AccountDeletion = ReturnType<typeof useAccountDeletion>;
