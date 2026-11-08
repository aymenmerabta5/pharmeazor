import type { AdminUserRole, AdminUsersFilterInput, CreateAdminUserInput } from "./schema";

export interface AdminUser {
  id: string;
  identityId: string | null;
  name: string | null;
  email: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface AdminUsersFilters {
  search: string;
  page: number;
  limit: number;
}

export const DEFAULT_ADMIN_USERS_FILTERS: AdminUsersFilters = {
  search: "",
  page: 1,
  limit: 20,
};

export interface AdminUsersResult {
  users: AdminUser[];
  total: number;
}

export interface AdminUsersQueryState {
  data: AdminUsersResult | undefined;
  error: unknown;
  isFetching: boolean;
  isPending: boolean;
  hasMore: boolean;
  totalIsExact: boolean;
  requestPage?: (page: number) => void;
  retry?: () => Promise<void>;
}

export type AdminUsersInitialData = AdminUsersResult;

export type { AdminUserRole, AdminUsersFilterInput, CreateAdminUserInput };
