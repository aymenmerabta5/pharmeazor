"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboardNavbar } from "./use-dashboard-navbar";

export function DashboardNavbar(): React.JSX.Element {
  const { user, onSignOut } = useDashboardNavbar();
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">GhostInit</span>
        {user ? <Badge variant="secondary">{user.role ?? "user"}</Badge> : null}
      </div>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <span className="hidden sm:inline text-xs text-muted-foreground">{user.email}</span>
            <Button size="sm" variant="ghost" onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" render={<Link href="/sign-in">Sign in</Link>} />
        )}
      </div>
    </header>
  );
}
