"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adminUsersQueryKey } from "./queries";
import {
  changeAdminUserRoleAction,
  createAdminUserAction,
  setAdminUserBannedAction,
} from "@/app/admin/users/actions";
import type { AdminUserRole, CreateAdminUserInput } from "./types";

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<Error | null>(null);
  const [createPending, setCreatePending] = React.useState(false);
  const [rolePendingId, setRolePendingId] = React.useState<string | null>(null);
  const [banPendingId, setBanPendingId] = React.useState<string | null>(null);
  function resetErrors(): void {
    setError(null);
  }
  async function finish(result: { ok: true } | { ok: false; error: string }): Promise<boolean> {
    if (!result.ok) {
      setError(new Error(result.error));
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: adminUsersQueryKey() });
    return true;
  }
  return {
    async createUser(input: CreateAdminUserInput): Promise<boolean> {
      resetErrors();
      setCreatePending(true);
      try {
        return await finish(await createAdminUserAction(input));
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error("Create failed"));
        return false;
      } finally {
        setCreatePending(false);
      }
    },
    async updateRole(userId: string, role: AdminUserRole): Promise<boolean> {
      resetErrors();
      setRolePendingId(userId);
      try {
        return await finish(await changeAdminUserRoleAction({ userId, role }));
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error("Role update failed"));
        return false;
      } finally {
        setRolePendingId(null);
      }
    },
    async updateBanned(userId: string, banned: boolean): Promise<boolean> {
      resetErrors();
      setBanPendingId(userId);
      try {
        return await finish(await setAdminUserBannedAction({ userId, banned }));
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error("Ban update failed"));
        return false;
      } finally {
        setBanPendingId(null);
      }
    },
    error,
    createPending,
    rolePendingId,
    banPendingId,
    resetErrors,
  };
}
