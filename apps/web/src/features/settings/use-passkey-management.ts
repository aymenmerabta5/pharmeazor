"use client";
import { useAppForm } from "@/components/ui/form";
import { toast } from "sonner";
import { z } from "zod";
import { isIdentityRecentAuthenticationError } from "@/lib/auth-model";
import { useSurfaceTranslations } from "@/lib/translations";
import { usePasskeyListQuery } from "./queries";
import { usePasskeyMutation } from "./mutations";
import type { PasskeySummary } from "./model";

export function usePasskeyManagement() {
  const t = useSurfaceTranslations("settings");
  const query = usePasskeyListQuery();
  const mutation = usePasskeyMutation();
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      const result = await mutation.run({ kind: "register", name: value.name.trim() || undefined });
      if (result.status !== "success" || !result.isCurrent()) return;
      form.reset();
      toast.success(t("passkeys.registered"));
    },
  });
  const error = query.error ?? mutation.error;
  return {
    form,
    passkeys: query.data ?? [],
    loading: query.isPending,
    refreshing: query.isFetching,
    readSucceeded: query.isSuccess,
    error: error
      ? isIdentityRecentAuthenticationError(error.cause)
        ? t("passkeys.reauthenticate")
        : t("passkeys.genericError")
      : null,
    retry: () => {
      void query.refetch();
    },
  };
}

export function usePasskeyEditor(passkey: PasskeySummary) {
  const t = useSurfaceTranslations("settings");
  const mutation = usePasskeyMutation();
  const form = useAppForm({
    defaultValues: { name: passkey.name ?? t("passkeys.unnamed") },
    validators: {
      onSubmit: z.object({ name: z.string().trim().min(1, t("passkeys.nameRequired")).max(64) }),
    },
    onSubmit: async ({ value }) => {
      const result = await mutation.run({
        kind: "rename",
        id: passkey.id,
        name: value.name.trim(),
      });
      if (result.status === "success" && result.isCurrent()) toast.success(t("passkeys.renamed"));
    },
  });
  async function remove(): Promise<void> {
    const result = await mutation.run({ kind: "delete", id: passkey.id });
    if (result.status === "success" && result.isCurrent()) toast.success(t("passkeys.deleted"));
  }
  return {
    form,
    remove,
    pending: mutation.isPending,
    error: mutation.error
      ? isIdentityRecentAuthenticationError(mutation.error.cause)
        ? t("passkeys.reauthenticate")
        : t("passkeys.genericError")
      : null,
  };
}
export type PasskeyManagement = ReturnType<typeof usePasskeyManagement>;
export type PasskeyEditor = ReturnType<typeof usePasskeyEditor>;
