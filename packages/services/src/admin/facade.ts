import "server-only";
import { AdminServiceError } from "./errors";
import { assertAdminActor, assertCanChangeBan, assertCanChangeRole } from "./policy";
import type { AdminAuditPort, AdminIdentityPort, AdminUserCreationPort } from "./ports";
import type {
  AdminActor,
  AdminUserRole,
  CreateAdminUserInput,
  ListAdminUsersInput,
} from "./contracts";

export interface AdminServiceDependencies {
  identity: AdminIdentityPort;
  audit: AdminAuditPort;
  userCreation?: AdminUserCreationPort;
  now?: () => Date;
}

export function createAdminService({
  identity,
  audit,
  userCreation,
  now = () => new Date(),
}: AdminServiceDependencies) {
  return {
    async listUsers(actor: AdminActor, input: ListAdminUsersInput) {
      assertAdminActor(actor);
      return await identity.listUsers(input);
    },
    async createUser(actor: AdminActor, input: CreateAdminUserInput) {
      assertAdminActor(actor);
      const occurredAt = now();
      if (userCreation) {
        return await userCreation.createUserWithAudit({ actor, input, occurredAt });
      }
      if (!identity.createUser) {
        throw new AdminServiceError(
          "ADMIN_ATOMIC_CREATE_REQUIRED",
          "This identity adapter requires an atomic user-creation port",
        );
      }
      const user = await identity.createUser(input);
      await audit.record({
        action: "admin.user.created",
        actorId: actor.id,
        targetId: user.id,
        metadata: { role: user.role },
        occurredAt,
      });
      return user;
    },
    async changeRole(actor: AdminActor, targetId: string, role: AdminUserRole) {
      assertAdminActor(actor);
      const target = await identity.getUser(targetId);
      if (!target) throw new AdminServiceError("ADMIN_USER_NOT_FOUND", "User not found");
      const adminCount =
        target.role === "admin" && role !== "admin" ? await identity.countAdmins() : 2;
      assertCanChangeRole(actor, target, role, adminCount);
      await identity.changeRole(targetId, role);
      await audit.record({
        action: "admin.user.role_changed",
        actorId: actor.id,
        targetId,
        metadata: { previousRole: target.role, role },
        occurredAt: now(),
      });
      return { id: targetId, role };
    },
    async setBanned(actor: AdminActor, targetId: string, banned: boolean, reason?: string) {
      assertAdminActor(actor);
      const target = await identity.getUser(targetId);
      if (!target) throw new AdminServiceError("ADMIN_USER_NOT_FOUND", "User not found");
      assertCanChangeBan(actor, target);
      await identity.setBanned(targetId, banned, reason);
      await audit.record({
        action: "admin.user.ban_changed",
        actorId: actor.id,
        targetId,
        metadata: { banned, reason: reason ?? null },
        occurredAt: now(),
      });
      return { id: targetId, banned };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
