"use client";
import { useRouter } from "next/navigation";
import { signOutShell } from "./mutations";
import type { WorkspaceDestination } from "./navigation-model";

export function useShellActions() {
  const router = useRouter();
  function onNavigate(destination: WorkspaceDestination): void {
    router.push(destination);
  }
  async function onSignOut(): Promise<void> {
    await signOutShell();
    router.push("/");
    router.refresh();
  }
  return { onNavigate, onSignOut };
}
