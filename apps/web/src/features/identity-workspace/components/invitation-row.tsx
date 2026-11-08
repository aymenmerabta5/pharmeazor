"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import type { IdentityInvitation } from "../types";

interface InvitationRowProps {
  invitation: IdentityInvitation;
  pending: boolean;
  canAccept: boolean;
  canCancel: boolean;
  onAccept(): void;
  onCancel(): void;
}

export function InvitationRow({
  invitation,
  pending,
  canAccept,
  canCancel,
  onAccept,
  onCancel,
}: InvitationRowProps): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const role = t(
    invitation.role === "owner"
      ? "roles.owner"
      : invitation.role === "admin"
        ? "roles.admin"
        : "roles.member",
  );
  const status = t(
    invitation.status === "pending"
      ? "statuses.pending"
      : invitation.status === "accepted"
        ? "statuses.accepted"
        : invitation.status === "expired"
          ? "statuses.expired"
          : "statuses.cancelled",
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">
          {role} · {status}
        </p>
      </div>
      {invitation.status === "pending" ? (
        <div className="flex gap-2">
          {canAccept ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onAccept}>
              {t("accept")}
            </Button>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="destructive" disabled={pending} onClick={onCancel}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
