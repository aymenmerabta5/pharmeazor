"use client";
import { useAppForm } from "@/components/ui/form";
import { useAdminUserMutations } from "./mutations";
import { resolveAdminUsersError } from "./queries";
import { createAdminUserSchema } from "./schema";
import { translateAdminUsersError } from "./translations";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import type { CreateAdminUserInput } from "./types";

export function useCreateAdminUser(onCreated: () => void) {
  const translate = useAdminUsersTranslations();
  const mutations = useAdminUserMutations();
  const defaultValues: CreateAdminUserInput = { name: "", email: "", password: "", role: "user" };
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: createAdminUserSchema(translate) },
    onSubmit: async ({ value }) => {
      const created = await mutations.createUser(value);
      if (created) {
        form.reset();
        onCreated();
      }
    },
  });
  return {
    form,
    translate,
    pending: mutations.createPending,
    error: translateAdminUsersError(
      resolveAdminUsersError(mutations.error),
      translate,
      "errors.createFailed",
    ),
  };
}
