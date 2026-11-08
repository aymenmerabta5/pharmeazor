"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { resolveRpcError } from "@/lib/query-client";
import type { AdminUsersFilters, AdminUsersInitialData, AdminUsersQueryState } from "./types";

export interface AdminUsersQueryOptionsConfig {
  initialData?: AdminUsersInitialData;
}
export function resolveAdminUsersError(error: unknown) {
  return error ? (resolveRpcError(error) ?? {}) : null;
}
export function adminUsersQueryOptions(
  input: AdminUsersFilters,
  config: AdminUsersQueryOptionsConfig = {},
) {
  return orpc.adminUsers.list.queryOptions({
    input,
    ...(config.initialData ? { initialData: config.initialData } : {}),
    select: (data) => ({
      total: data.total,
      users: data.users.map((user) => ({ ...user, identityId: user.id })),
    }),
  });
}
export function adminUsersQueryKey() {
  return orpc.adminUsers.list.key({ type: "query" });
}
export function useAdminUsersData(
  input: AdminUsersFilters,
  initialData?: AdminUsersInitialData,
): AdminUsersQueryState {
  const query = useQuery(adminUsersQueryOptions(input, initialData ? { initialData } : undefined));
  return {
    data: query.data,
    error: query.error,
    isFetching: query.isFetching,
    isPending: query.isPending,
    hasMore: false,
    totalIsExact: true,
    retry: async () => {
      await query.refetch();
    },
  };
}
