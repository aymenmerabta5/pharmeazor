import "server-only";
import type {
  AdminActor,
  AdminAuditEvent,
  AdminUser,
  AdminUserRole,
  CreateAdminUserInput,
  ListAdminUsersInput,
  ListAdminUsersResult,
} from "./contracts";

export interface AdminIdentityPort {
  listUsers(input: ListAdminUsersInput): Promise<ListAdminUsersResult>;
  getUser(userId: string): Promise<AdminUser | null>;
  countAdmins(): Promise<number>;
  /**
   * Non-Postgres providers may own creation in one native transaction. The
   * Postgres Better Auth read adapter deliberately omits this optional method;
   * its composition root must provide AdminUserCreationPort instead.
   */
  createUser?(input: CreateAdminUserInput): Promise<AdminUser>;
  changeRole(userId: string, role: AdminUserRole): Promise<void>;
  setBanned(userId: string, banned: boolean, reason?: string): Promise<void>;
}

export interface CreateAdminUserCommand {
  actor: AdminActor;
  input: CreateAdminUserInput;
  occurredAt: Date;
}

/** Commits the identity, credential account, and mandatory audit as one unit. */
export interface AdminUserCreationPort {
  createUserWithAudit(command: CreateAdminUserCommand): Promise<AdminUser>;
}

export interface AdminAuditPort {
  record(event: AdminAuditEvent): Promise<void>;
}
