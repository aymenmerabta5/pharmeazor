"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc, orpcClient } from "@/lib/orpc";
import {
  authScopedQueryKey,
  currentQueryAuthGeneration,
  currentQueryAuthScope,
  subscribeQueryAuthGeneration,
} from "@/lib/query-client";

export function useManualQueryScope() {
  const queryClient = useQueryClient();
  const subscribe = React.useCallback(
    (changed: () => void) => subscribeQueryAuthGeneration(queryClient, changed),
    [queryClient],
  );
  const read = React.useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  const generation = React.useSyncExternalStore(subscribe, read, () => 0);
  return { queryClient, generation, scope: currentQueryAuthScope(queryClient) };
}
export function useManualSummary() {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.summary.queryOptions();
  return useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "manual-summary"],
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
}
export function useManualHistory() {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.list.queryOptions();
  return useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "manual-history"],
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
}
export function useManualReviewQueue(canReview: boolean) {
  const { scope } = useManualQueryScope();
  const options = orpc.billing.manual.reviewQueue.queryOptions();
  return useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "manual-review"],
    enabled: Boolean(scope) && canReview && typeof window !== "undefined",
    staleTime: 15_000,
  });
}
export function useManualReceipt(id: string, instanceId: string, requested: boolean) {
  const { scope } = useManualQueryScope();
  return useQuery({
    queryKey: scope
      ? authScopedQueryKey(scope, ["manual-receipt", id, instanceId])
      : ["auth", "anonymous", "manual-receipt", instanceId],
    queryFn: () => orpcClient.billing.manual.receipt({ id }),
    enabled: Boolean(scope) && requested && typeof window !== "undefined",
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
