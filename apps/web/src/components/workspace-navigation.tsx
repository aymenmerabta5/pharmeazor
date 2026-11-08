"use client";

import type * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Bot,
  FolderOpen,
  CreditCard,
  FileText,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceIdentityStatus } from "./workspace-identity-status";

import { WORKSPACE_NAVIGATION, isCurrentPath } from "@/features/app-shell/navigation-model";

const ICONS = {
  dashboard: LayoutDashboard,
  agent: Bot,
  storage: FolderOpen,
  billing: CreditCard,
  pdf: FileText,
  settings: Settings2,
  admin: ShieldCheck,
} as const;

export function WorkspaceNavigation({
  pathname,
  identity,
  onNavigate,
}: {
  pathname: string;
  identity: WorkspaceIdentity;
  onNavigate?: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  if (identity.status !== "authenticated") return <WorkspaceIdentityStatus identity={identity} />;
  const isAdmin = identity.user.role === "admin";
  return (
    <nav aria-label={t("primaryNavigation")} className="flex flex-col gap-1">
      {WORKSPACE_NAVIGATION.filter((item) => item.label !== "admin" || isAdmin).map(
        ({ path, label, match }) => {
          const Icon = ICONS[label];
          const active = isCurrentPath(pathname, path, match);
          return (
            <Link
              key={path}
              href={path}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")
              }
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 break-words">{t(label)}</span>
            </Link>
          );
        },
      )}
    </nav>
  );
}
