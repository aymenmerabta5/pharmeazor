"use client";
import { authClient } from "@/lib/auth-client";
import { getQueryClient, transitionQueryAuthScope } from "@/lib/query-client";

export async function signOutShell(): Promise<void> {
  await authClient.signOut();
  transitionQueryAuthScope(getQueryClient(), null);
}
