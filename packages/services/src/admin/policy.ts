import "server-only";
import { AdminServiceError } from "./errors";
import type { AdminActor, AdminUser, AdminUserRole } from "./contracts";

export type AdminPolicyErrorCode =
  | "ADMIN_FORBIDDEN"
  | "ADMIN_ACTOR_BANNED"
  | "ADMIN_SELF_ACTION"
  | "ADMIN_LAST_ADMIN";

export function assertAdminActor(actor: AdminActor): void {
  if (actor.banned)
    throw new AdminServiceError<AdminPolicyErrorCode>(
      "ADMIN_ACTOR_BANNED",
      "Suspended accounts cannot administer users",
    );
  if (actor.role !== "admin")
    throw new AdminServiceError<AdminPolicyErrorCode>(
      "ADMIN_FORBIDDEN",
      "Administrator access is required",
    );
}

export function assertCanChangeRole(
  actor: AdminActor,
  target: AdminUser,
  role: AdminUserRole,
  adminCount: number,
): void {
  assertAdminActor(actor);
  if (actor.id === target.id && role !== "admin") {
    throw new AdminServiceError<AdminPolicyErrorCode>(
      "ADMIN_SELF_ACTION",
      "You cannot remove your own administrator role",
    );
  }
  if (target.role === "admin" && role !== "admin" && adminCount <= 1) {
    throw new AdminServiceError<AdminPolicyErrorCode>(
      "ADMIN_LAST_ADMIN",
      "The final administrator cannot be demoted",
    );
  }
}

export function assertCanChangeBan(actor: AdminActor, target: AdminUser): void {
  assertAdminActor(actor);
  if (actor.id === target.id) {
    throw new AdminServiceError<AdminPolicyErrorCode>(
      "ADMIN_SELF_ACTION",
      "You cannot change your own suspension state",
    );
  }
}
