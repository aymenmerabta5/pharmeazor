"use client";

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { UserRowConfirmationDialog } from "./user-row-confirmation";
import type { AdminUsersTranslate } from "../translations";
import type { AdminUserActionOptions, useAdminUserAction } from "../use-admin-user-action";

export interface UserRowProps
  extends
    Pick<AdminUserActionOptions, "user" | "rolePending" | "banPending">,
    ReturnType<typeof useAdminUserAction> {
  translate: AdminUsersTranslate;
}

export function UserRow({
  user,
  rolePending,
  banPending,
  confirmation,
  canManage,
  pending,
  chooseRole,
  chooseBan,
  cancel,
  confirmAction,
  translate,
}: UserRowProps): React.JSX.Element {
  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{user.name ?? user.email}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {translate(user.role === "admin" ? "roles.admin" : "roles.user")}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={user.banned ? "destructive" : "outline"}>
            {translate(user.banned ? "status.suspended" : "status.active")}
          </Badge>
        </TableCell>
        <TableCell>
          <div
            className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end"
            onFocusCapture={(event) =>
              event.target.scrollIntoView({ block: "nearest", inline: "nearest" })
            }
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || rolePending || banPending}
              onClick={chooseRole}
            >
              {rolePending
                ? translate("actions.updating")
                : translate(user.role === "admin" ? "actions.demote" : "actions.promote")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || rolePending || banPending}
              onClick={chooseBan}
            >
              {banPending
                ? translate("actions.updating")
                : translate(user.banned ? "actions.restore" : "actions.suspend")}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <UserRowConfirmationDialog
        translate={translate}
        confirmation={confirmation}
        user={user}
        pending={pending}
        canManage={canManage}
        onCancel={cancel}
        onConfirm={() => void confirmAction()}
      />
    </>
  );
}
