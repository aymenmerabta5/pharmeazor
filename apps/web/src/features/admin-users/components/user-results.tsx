"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { AdminUsersPagination } from "./filters";
import { UserTable, UserTableSkeleton } from "./user-table";
import type { useAdminUsers } from "../use-admin-users";
import type { AdminUsersTranslate } from "../translations";

export interface AdminUsersResultsProps {
  admin: ReturnType<typeof useAdminUsers>;
  translate: AdminUsersTranslate;
}

export function AdminUsersResults({ admin, translate }: AdminUsersResultsProps): React.JSX.Element {
  const showEmpty =
    admin.total !== undefined && !admin.isPending && !admin.queryError && admin.users.length === 0;
  return (
    <>
      {admin.queryError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{translate("list.loadErrorTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{admin.queryError}</span>
            {admin.retry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void admin.retry?.()}
              >
                {translate("list.retry")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {admin.mutationError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{translate("list.saveErrorTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{admin.mutationError}</span>
            <Button type="button" size="sm" variant="outline" onClick={admin.resetMutationError}>
              {translate("list.dismiss")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {admin.isPending ? (
        <UserTableSkeleton translate={translate} />
      ) : showEmpty ? (
        <Empty className="rounded-lg border bg-card">
          <EmptyHeader>
            <EmptyTitle>
              {translate(admin.filters.search ? "list.emptySearchTitle" : "list.emptyTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {admin.filters.search
                ? admin.hasMore
                  ? translate("list.emptyLoadedDescription")
                  : translate("list.emptySearchDescription")
                : translate("list.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex justify-center gap-2">
            {admin.filters.search ? (
              admin.hasMore ? (
                <Button type="button" variant="outline" onClick={() => admin.nextPage()}>
                  {translate("list.searchNextBatch")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={admin.clearFilters}>
                  {translate("list.clearSearch")}
                </Button>
              )
            ) : (
              <Button render={<a href="/admin/users/create" />} nativeButton={false}>
                {translate("list.create")}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : admin.total !== undefined ? (
        <UserTable
          translate={translate}
          users={admin.users}
          total={admin.total}
          totalIsExact={admin.totalIsExact}
          rolePendingId={admin.rolePendingId}
          banPendingId={admin.banPendingId}
          onToggleRole={admin.toggleRole}
          onToggleBanned={admin.toggleBanned}
        />
      ) : null}
      {admin.total !== undefined && !admin.isPending && !admin.queryError && !showEmpty ? (
        <AdminUsersPagination
          translate={translate}
          page={admin.filters.page}
          totalPages={admin.totalPages}
          hasMore={admin.hasMore}
          isFetching={admin.isFetching}
          onPrevious={admin.previousPage}
          onNext={admin.nextPage}
        />
      ) : null}
    </>
  );
}
