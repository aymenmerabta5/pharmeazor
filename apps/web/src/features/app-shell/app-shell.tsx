"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { Header } from "@/components/header";
import { HeaderActions } from "@/components/header-actions";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { WorkspaceNavigationTrigger } from "@/components/workspace-navigation-trigger";

import { useAppShell } from "./use-app-shell";
import { appShellMode } from "./shell-mode";

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { identity, pathname, section, onNavigate, onSignOut } = useAppShell();
  const t = useSurfaceTranslations("header");
  const workspace = section !== undefined;
  const navigationProps = { pathname, identity };
  if (appShellMode(pathname) === "immersive") {
    return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
  }

  return (
    <div className="min-h-dvh">
      {workspace ? <WorkspaceSidebar {...navigationProps} /> : null}
      <div className={workspace ? "min-w-0 lg:ps-[232px]" : "min-w-0"}>
        <Header
          workspace={workspace}
          title={section ? t(section) : undefined}
          navigation={workspace ? <WorkspaceNavigationTrigger {...navigationProps} /> : undefined}
        >
          <HeaderActions identity={identity} onNavigate={onNavigate} onSignOut={onSignOut} />
        </Header>
        {children}
      </div>
    </div>
  );
}
