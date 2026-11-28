/**
 * The role vocabulary, without the access-control wiring.
 *
 * `access.ts` builds Better Auth's access-control roles and therefore pulls in
 * `better-auth/plugins/access`. A caller that only needs to ask "is this user an
 * administrator?" must not bundle that plugin, so the names and the predicate
 * live here and `access.ts` re-exports them.
 */

export const ADMIN_ROLE_NAMES = ["admin", "superAdmin"] as const;

export type AdminRole = (typeof ADMIN_ROLE_NAMES)[number];

export function isAdminRole(role: unknown): role is AdminRole {
  return role === "admin" || role === "superAdmin";
}
