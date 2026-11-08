import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { currentQueryAuthGeneration, subscribeQueryAuthGeneration } from "@/lib/query-client";
import { useAuth } from "@/hooks/use-auth";
export function useAgentOwnership() {
  const client = useQueryClient();
  const subscribe = useCallback(
    (changed: () => void) => subscribeQueryAuthGeneration(client, changed),
    [client],
  );
  const read = useCallback(() => currentQueryAuthGeneration(client), [client]);
  const generation = useSyncExternalStore(subscribe, read, () => 0);
  const identity = useAuth();
  return { generation, isPending: identity.isPending, isAuthenticated: identity.isAuthenticated };
}
