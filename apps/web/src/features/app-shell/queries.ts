"use client";
import { useAuth } from "@/hooks/use-auth";
import { useQueryAuthSession } from "@/components/query-auth-boundary";

export function useShellIdentitySource() {
  const session = useAuth();
  const canonical = useQueryAuthSession();
  return {
    pending: canonical?.hasCanonicalApi ? canonical.isPending : session.isPending,
    error: canonical?.hasCanonicalApi ? canonical.error : session.error,
    user: (canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.user) ?? null,
    retry:
      canonical?.retry ??
      (() => {
        void session.refetch();
      }),
  };
}
