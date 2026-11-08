"use client";
import { useSyncExternalStore } from "react";
import { identityClient } from "@/lib/auth-client";
import { useQueryAuthSession } from "@/components/query-auth-boundary";

export interface DashboardIdentityUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useDashboardIdentity(initialUser?: DashboardIdentityUser) {
  const session = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const pending = canonical?.hasCanonicalApi ? canonical.isPending : session.isPending;
  const error = canonical?.hasCanonicalApi ? canonical.error : session.error;
  const liveUser = canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.data?.user;
  const user: DashboardIdentityUser | null | undefined = hydrated
    ? pending || error
      ? null
      : liveUser
    : (initialUser ?? liveUser);
  return { user, pending: hydrated && pending, error: hydrated ? error : null };
}
