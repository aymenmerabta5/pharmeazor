"use client";
import { useAppForm } from "@/components/ui/form";
import { adminUsersFilterSchema } from "./schema";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import type { AdminUsersFilterInput } from "./types";

export interface AdminUserFilterOptions {
  search: string;
  isFetching: boolean;
  onApply(input: AdminUsersFilterInput): void;
  onClear(): void;
}
export function useAdminUserFilters({
  search,
  isFetching,
  onApply,
  onClear,
}: AdminUserFilterOptions) {
  const translate = useAdminUsersTranslations();
  const form = useAppForm({
    defaultValues: { search },
    validators: { onSubmit: adminUsersFilterSchema(translate) },
    onSubmit: ({ value }) => onApply(value),
  });
  function clear(): void {
    form.setFieldValue("search", "");
    onClear();
  }
  return { form, translate, search, isFetching, clear };
}
