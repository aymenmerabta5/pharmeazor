"use client";
import type * as React from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceIdentity } from "@/components/workspace-identity";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * The account block at the bottom of the menu.
 *
 * Signed-out visitors get the two actions they came for, with the primary one
 * forward; signed-in users see who they are and a single, quiet way out. Rows
 * stay typographic so the whole menu reads as one list.
 */
export function MobileMenuAccount({
  identity,
  signOutPending,
  onSignOut,
  onNavigate,
}: {
  identity: WorkspaceIdentity;
  signOutPending: boolean;
  onSignOut(): void;
  onNavigate(): void;
}): React.JSX.Element {
  const header = useSurfaceTranslations("header");
  const common = useSurfaceTranslations("common");
  const auth = useSurfaceTranslations("auth");

  if (identity.status === "pending") {
    return (
      <div className="border-t pt-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
    );
  }

  if (identity.status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <span className="text-xl text-muted-foreground">{header("accountUnavailable")}</span>
        <button
          type="button"
          onClick={identity.retry}
          className="ph-menu-row min-h-11 rounded-lg px-1 text-xl text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {common("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t pt-4">
      <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {identity.status === "authenticated"
          ? (identity.user.name ?? identity.user.email ?? header("fallbackUser"))
          : header("notSignedIn")}
      </p>

      {identity.status === "authenticated" ? (
        <button
          type="button"
          disabled={signOutPending}
          onClick={onSignOut}
          className="ph-menu-row flex min-h-12 items-center rounded-lg px-0 text-[22px] leading-7 tracking-tight text-destructive transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {header("signOut")}
        </button>
      ) : (
        <div className="flex flex-col">
          <Link
            href="/auth/sign-in"
            onClick={onNavigate}
            className="ph-menu-row flex min-h-12 items-center rounded-lg px-0 text-[22px] leading-7 tracking-tight text-muted-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {auth("signInTitle")}
          </Link>
          <Link
            href="/auth/sign-up"
            onClick={onNavigate}
            className="ph-menu-row flex min-h-12 items-center rounded-lg px-0 text-[22px] font-medium leading-7 tracking-tight text-primary transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {auth("signUpTitle")}
          </Link>
        </div>
      )}
    </div>
  );
}
