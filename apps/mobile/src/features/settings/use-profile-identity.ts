"use client";
import { useSyncExternalStore } from "react";
import { useSettingsIdentityQuery } from "./queries";
import type { SettingsUser } from "./model";
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function useProfileIdentity(initialUser?: SettingsUser) {
  const identity = useSettingsIdentityQuery();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return {
    user: hydrated ? identity.user : (initialUser ?? identity.user),
    pending: hydrated && identity.isPending,
    error: identity.error,
  };
}
