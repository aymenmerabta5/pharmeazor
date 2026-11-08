"use client";
import { useState } from "react";
import type { AdminUser, AdminUserRole } from "./types";
export type UserRowConfirmation = "role" | "ban" | null;
export interface AdminUserActionOptions {
  user: AdminUser;
  rolePending: boolean;
  banPending: boolean;
  onToggleRole(identityId: string, currentRole: AdminUserRole): Promise<boolean>;
  onToggleBanned(identityId: string, currentlyBanned: boolean): Promise<boolean>;
}
export function useAdminUserAction(options: AdminUserActionOptions) {
  const { user, rolePending, banPending, onToggleRole, onToggleBanned } = options;
  const [confirmation, setConfirmation] = useState<UserRowConfirmation>(null);
  const canManage = user.identityId !== null;
  const pending = confirmation === "role" ? rolePending : banPending;
  async function confirmAction(): Promise<void> {
    if (!user.identityId || !confirmation) return;
    const succeeded =
      confirmation === "role"
        ? await onToggleRole(user.identityId, user.role)
        : await onToggleBanned(user.identityId, user.banned);
    if (succeeded) setConfirmation(null);
  }
  return {
    confirmation,
    canManage,
    pending,
    confirmAction,
    chooseRole: () => setConfirmation("role"),
    chooseBan: () => setConfirmation("ban"),
    cancel: () => setConfirmation(null),
  };
}
