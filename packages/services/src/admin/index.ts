export { createAdminService, type AdminService, type AdminServiceDependencies } from "./facade";
export { AdminServiceError } from "./errors";
export {
  assertAdminActor,
  assertCanChangeBan,
  assertCanChangeRole,
  type AdminPolicyErrorCode,
} from "./policy";
export { ADMIN_USER_ROLES } from "./contracts";
export type {
  AdminActor,
  AdminAuditAction,
  AdminAuditEvent,
  AdminUser,
  AdminUserRole,
  CreateAdminUserInput,
  ListAdminUsersInput,
  ListAdminUsersResult,
} from "./contracts";
export type {
  AdminAuditPort,
  AdminIdentityPort,
  AdminUserCreationPort,
  CreateAdminUserCommand,
} from "./ports";
export { createBetterAuthAdminIdentityPort, type BetterAuthAdminApi } from "./better-auth-adapter";
