"use client";
import { authClient } from "@/lib/auth-client";
export async function signOutNavbar(): Promise<void> {
  await authClient.signOut();
}
