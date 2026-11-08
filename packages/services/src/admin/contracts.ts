import "server-only";

export const ADMIN_USER_ROLES = ["user", "admin"] as const;
export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];

export interface AdminActor {
  id: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface ListAdminUsersInput {
  search?: string;
  page: number;
  limit: number;
}

export interface ListAdminUsersResult {
  users: AdminUser[];
  total: number;
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  password: string;
  role: AdminUserRole;
}

export type AdminAuditAction =
  | "admin.user.created"
  | "admin.user.role_changed"
  | "admin.user.ban_changed";

export interface AdminAuditEvent {
  action: AdminAuditAction;
  actorId: string;
  targetId: string;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: Date;
}
