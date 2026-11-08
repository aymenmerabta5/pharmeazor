"use client";

import { authClient } from "../lib/auth-client";

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession();

  return {
    session: session ?? null,
    user: session?.user ?? null,
    isPending,
    isAuthenticated: !!session?.user,
    isPendingAuth: isPending,
    error: error ?? null,
    refetch,
  };
}
