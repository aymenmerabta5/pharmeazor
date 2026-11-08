"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AdminUsersTranslate } from "../translations";
import type { AdminUser } from "../types";
import type { UserRowConfirmation } from "../use-admin-user-action";
export type { UserRowConfirmation } from "../use-admin-user-action";

export interface UserRowConfirmationDialogProps {
  translate: AdminUsersTranslate;
  confirmation: UserRowConfirmation;
  user: AdminUser;
  pending: boolean;
  canManage: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function UserRowConfirmationDialog({
  confirmation,
  user,
  pending,
  canManage,
  onCancel,
  onConfirm,
  translate,
}: UserRowConfirmationDialogProps): React.JSX.Element {
  const changingRole = confirmation === "role";
  const nextRole = user.role === "admin" ? "user" : "admin";
  return (
    <AlertDialog
      open={confirmation !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {changingRole
              ? translate(nextRole === "admin" ? "dialogs.grantTitle" : "dialogs.removeTitle")
              : translate(user.banned ? "dialogs.restoreTitle" : "dialogs.suspendTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {changingRole
              ? translate("dialogs.roleDescription", {
                  email: user.email,
                  role: translate(nextRole === "admin" ? "roles.admin" : "roles.user"),
                })
              : translate(
                  user.banned ? "dialogs.restoreDescription" : "dialogs.suspendDescription",
                  {
                    email: user.email,
                    role: translate(user.role === "admin" ? "roles.admin" : "roles.user"),
                  },
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {translate("dialogs.cancel")}
          </Button>
          <Button
            type="button"
            variant={!changingRole && !user.banned ? "destructive" : "default"}
            disabled={!canManage || pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending
              ? translate("dialogs.saving")
              : changingRole
                ? translate("dialogs.confirmRole")
                : translate(user.banned ? "dialogs.restoreAccount" : "dialogs.suspendAccount")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
