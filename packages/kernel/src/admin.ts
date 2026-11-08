export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export interface AdminUser {
  id: string;
  authId?: string | null;
  name: string | null;
  email: string;
  role: UserRole;
  banned: boolean;
}
export interface UseAdminUsersReturn {
  data: { users: AdminUser[]; total: number } | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  toggleBan: (authId: string, banned: boolean) => Promise<void>;
  setRole: (authId: string, currentRole: UserRole) => Promise<void>;
}
export function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin";
}
