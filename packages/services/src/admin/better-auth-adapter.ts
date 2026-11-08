import "server-only";
import type { AdminIdentityPort } from "./ports";
import type { AdminUser, AdminUserRole } from "./contracts";

interface BetterAuthAdminUser {
  id: string;
  name: string;
  email: string;
  role?: unknown;
  banned?: boolean | null;
}

/**
 * Application-owned view of the Better Auth admin API.
 *
 * Keeping this structural contract here prevents the application service package
 * from depending on the concrete auth package while still checking the adapter
 * against the real Better Auth server at the API composition root.
 */
export interface BetterAuthAdminApi {
  readonly api: {
    listUsers(input: {
      headers: Headers;
      query: {
        limit: number;
        offset?: number;
        searchValue?: string;
        searchField?: "email";
        searchOperator?: "contains";
        filterField?: "role";
        filterValue?: "admin";
        filterOperator?: "eq";
      };
    }): Promise<{ users: BetterAuthAdminUser[]; total: number }>;
    getUser(input: {
      headers: Headers;
      query: { id: string };
    }): Promise<BetterAuthAdminUser | null>;
    setRole(input: {
      headers: Headers;
      body: { userId: string; role: AdminUserRole };
    }): Promise<unknown>;
    banUser(input: {
      headers: Headers;
      body: { userId: string; banReason?: string };
    }): Promise<unknown>;
    unbanUser(input: { headers: Headers; body: { userId: string } }): Promise<unknown>;
  };
}

function toAdminRole(role: unknown): AdminUserRole {
  return role === "admin" ? "admin" : "user";
}

function toAdminUser(user: {
  id: string;
  name: string;
  email: string;
  role?: unknown;
  banned?: boolean | null;
}): AdminUser {
  return {
    id: user.id,
    name: user.name || null,
    email: user.email,
    role: toAdminRole(user.role),
    banned: user.banned === true,
  };
}

export function createBetterAuthAdminIdentityPort(
  auth: BetterAuthAdminApi,
  headers: Headers,
): AdminIdentityPort {
  return {
    async listUsers(input) {
      const result = await auth.api.listUsers({
        headers,
        query: {
          limit: input.limit,
          offset: (input.page - 1) * input.limit,
          searchValue: input.search || undefined,
          searchField: "email",
          searchOperator: "contains",
        },
      });
      return { users: result.users.map(toAdminUser), total: result.total };
    },
    async getUser(userId) {
      const user = await auth.api.getUser({ headers, query: { id: userId } });
      return user ? toAdminUser(user) : null;
    },
    async countAdmins() {
      const result = await auth.api.listUsers({
        headers,
        query: { limit: 100, filterField: "role", filterValue: "admin", filterOperator: "eq" },
      });
      return result.total;
    },
    async changeRole(userId, role) {
      await auth.api.setRole({ headers, body: { userId, role } });
    },
    async setBanned(userId, banned, reason) {
      if (banned) {
        await auth.api.banUser({ headers, body: { userId, banReason: reason } });
      } else {
        await auth.api.unbanUser({ headers, body: { userId } });
      }
    },
  };
}
