"use client";
import type * as React from "react";
import { compactIdentityId } from "../access";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";

export function MemberIdentity({
  userId,
  currentUser,
}: {
  userId: string;
  currentUser: { id: string; name: string | null } | null;
}): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const isCurrentUser = currentUser?.id === userId;
  const name = isCurrentUser ? currentUser?.name?.trim() : undefined;
  return (
    <div className="min-w-0 space-y-1">
      <p className="truncate text-sm font-medium">
        {name || (isCurrentUser ? t("you") : t("memberLabel"))}
        {name ? (
          <span className="ms-2 text-xs font-normal text-muted-foreground">{t("you")}</span>
        ) : null}
      </p>
      <code dir="ltr" title={userId} className="block text-xs text-muted-foreground">
        {compactIdentityId(userId)}
      </code>
    </div>
  );
}
