"use client";

import { Button } from "@/components/ui/button";
import { CreateUserForm } from "./components/create-user-form";
import { AdminUserFilters } from "./components/filters";
import { AdminUsersResults } from "./components/user-results";
import { useAdminUsers } from "./use-admin-users";
import { useCreateAdminUser } from "./use-create-admin-user";
import { useAdminUserFilters } from "./use-admin-user-filters";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import { formatAdminUsersAccountCount } from "./translations";
import type { AdminUsersInitialData } from "./types";

export interface AdminUsersFeatureProps {
  initialData?: AdminUsersInitialData;
}

export function AdminUsersFeature({ initialData }: AdminUsersFeatureProps): React.JSX.Element {
  const translate = useAdminUsersTranslations();
  const admin = useAdminUsers(initialData);
  const filters = useAdminUserFilters({
    search: admin.filters.search,
    isFetching: admin.isFetching,
    onApply: admin.applyFilters,
    onClear: admin.clearFilters,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{translate("list.title")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
            {translate("list.description")}{" "}
            {admin.total !== undefined
              ? formatAdminUsersAccountCount(translate, admin.total, admin.totalIsExact)
              : null}
          </p>
        </div>
        <Button
          className="w-auto self-start"
          render={<a href="/admin/users/create" />}
          nativeButton={false}
        >
          {translate("list.create")}
        </Button>
      </header>

      <AdminUserFilters {...filters} />
      <AdminUsersResults admin={admin} translate={translate} />
    </main>
  );
}

export interface AdminCreateUserFeatureProps {
  onCreated(): void;
}

export function AdminCreateUserFeature({
  onCreated,
}: AdminCreateUserFeatureProps): React.JSX.Element {
  const create = useCreateAdminUser(onCreated);
  return <CreateUserForm {...create} />;
}

export { adminUsersFilterSchema, adminUserRoleSchema, createAdminUserSchema } from "./schema";
export { formatAdminUsersAccountCount, translateAdminUsersError } from "./translations";
export { useAdminUsersTranslations } from "./use-admin-users-translations";
export type { AdminUsersMessageKey, AdminUsersTranslate } from "./translations";
export { DEFAULT_ADMIN_USERS_FILTERS } from "./types";
export type {
  AdminUser,
  AdminUserRole,
  AdminUsersFilterInput,
  AdminUsersFilters,
  AdminUsersInitialData,
  AdminUsersResult,
  CreateAdminUserInput,
} from "./types";
