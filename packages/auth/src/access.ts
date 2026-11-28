import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

export const superAdmin = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});
export const adminRole = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});
export const user = ac.newRole({ user: [], session: [] });
export const viewer = ac.newRole({ user: ["list"], session: ["list"] });

export const roles = {
  superAdmin,
  admin: adminRole,
  user,
  viewer,
} as const;
export type AccessRole = keyof typeof roles;

// The role vocabulary is dependency-free so a caller that only needs the
// administrator predicate does not bundle the access-control plugin.
export { ADMIN_ROLE_NAMES, isAdminRole, type AdminRole } from "./roles";
