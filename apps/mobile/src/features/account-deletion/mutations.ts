"use client";
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { identityClient } from "@/lib/auth-client";
import {
  currentQueryAuthScope,
  currentQueryAuthIdentity,
  currentQueryAuthGeneration,
  subscribeQueryAuthGeneration,
  transitionQueryAuthScope,
} from "@/lib/query-client";
import { createAccountDeletionOwner, identityFailure } from "./model";

interface DeletionInvocation {
  password?: string;
  isCurrent(): boolean;
  complete(): void;
}

export function useDeleteAccountMutation(onDeleted: () => void) {
  const queryClient = useQueryClient();
  const lifetime = useRef({ mounted: false, version: 0 });
  const admitted = useRef<DeletionInvocation | null>(null);
  useLayoutEffect(() => {
    lifetime.current.mounted = true;
    lifetime.current.version += 1;
    return () => {
      lifetime.current.mounted = false;
      lifetime.current.version += 1;
    };
  }, []);
  const subscribe = useCallback(
    (changed: () => void) => subscribeQueryAuthGeneration(queryClient, changed),
    [queryClient],
  );
  const snapshot = useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  useSyncExternalStore(subscribe, snapshot, () => 0);
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async (call: DeletionInvocation) => {
      if (!call.isCurrent()) return;
      const result = await identityClient.deleteAccount(
        call.password ? { password: call.password } : undefined,
      );
      if (!call.isCurrent()) return;
      if (result.error) throw identityFailure(result.error);
      // Retiring the initiating owner is the intended effect of successful deletion.
      transitionQueryAuthScope(queryClient, null);
      if (call.isCurrent()) call.complete();
    },
  });
  async function run(password?: string): Promise<void> {
    if (admitted.current?.isCurrent()) return;
    const version = lifetime.current.version;
    const isCurrent = createAccountDeletionOwner(
      () => ({
        identity: currentQueryAuthIdentity(queryClient),
        scope: currentQueryAuthScope(queryClient),
      }),
      () => lifetime.current.mounted && lifetime.current.version === version,
    );
    if (!isCurrent()) return;
    const call: DeletionInvocation = { password, isCurrent, complete: onDeleted };
    admitted.current = call;
    // Remember intermediate replacement owners even if identity later returns to its old value.
    const unsubscribe = subscribeQueryAuthGeneration(queryClient, () => {
      isCurrent();
    });
    try {
      await mutation.mutateAsync(call);
    } catch {
      /* Mutation owns the visible error. */
    } finally {
      unsubscribe();
      if (admitted.current === call) admitted.current = null;
    }
  }
  const visible = mutation.variables?.isCurrent() ?? true;
  return {
    run,
    pending: visible && mutation.isPending,
    error: visible ? mutation.error : null,
    reset: mutation.reset,
  };
}
