"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { currentQueryAuthGeneration } from "@/lib/query-client";

export function useAuthOwnedEffect(): () => () => boolean {
  const queryClient = useQueryClient();
  const lifetime = React.useRef({ queryClient, mounted: false, generation: 0 });
  lifetime.current.queryClient = queryClient;

  React.useLayoutEffect(() => {
    lifetime.current.mounted = true;
    lifetime.current.generation += 1;
    return () => {
      lifetime.current.mounted = false;
      lifetime.current.generation += 1;
    };
  }, [queryClient]);

  return React.useCallback(() => {
    const mountedGeneration = lifetime.current.generation;
    const authGeneration = currentQueryAuthGeneration(queryClient);
    // Completing a server mutation does not authorize effects in a later UI owner.
    return () =>
      lifetime.current.mounted &&
      lifetime.current.queryClient === queryClient &&
      lifetime.current.generation === mountedGeneration &&
      currentQueryAuthGeneration(queryClient) === authGeneration;
  }, [queryClient]);
}
