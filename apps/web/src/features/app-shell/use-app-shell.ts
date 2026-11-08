"use client";
import { usePathname } from "next/navigation";
import { resolveWorkspaceIdentity } from "@/components/workspace-identity";
import { useShellIdentitySource } from "./queries";
import { useShellActions } from "./use-shell-actions";
import { workspaceSection } from "./navigation-model";

export function useAppShell() {
  const source = useShellIdentitySource();
  const identity = resolveWorkspaceIdentity(source);
  const actions = useShellActions();
  const pathname = usePathname() ?? "/";
  return { identity, pathname, section: workspaceSection(pathname), ...actions };
}
