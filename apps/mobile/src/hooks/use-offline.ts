import * as React from "react";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  cancellableQueryPersister,
  currentQueryAuthGeneration,
  invalidateQueryAuthScope,
  isNativeQueryRestoreComplete,
  type NativeQueryRestore,
} from "@/lib/query-client";

export function useOfflineSync(
  queryClient: QueryClient,
  cacheScope: string | null,
): { isOnline: boolean; isRestoring: boolean } {
  const [isOnline, setIsOnline] = React.useState(true);
  const [restored, setRestored] = React.useState<NativeQueryRestore | null>(null);

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      onlineManager.setOnline(online);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (!cacheScope) return;
    const persistence = cancellableQueryPersister(
      createAsyncStoragePersister({
        storage: AsyncStorage,
        key: "ghostinit-query-cache:" + cacheScope,
      }),
    );
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient,
      persister: persistence.persister,
      buster: cacheScope,
      maxAge: 1000 * 60 * 60 * 24,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.state.status === "success" && query.queryKey[0] !== "__ghostinit",
      },
    });
    void restorePromise
      .catch((error: unknown) => {
        console.warn("[offline] Query cache restore failed", error);
      })
      .finally(() => {
        if (persistence.isActive())
          setRestored({
            queryClient,
            cacheScope,
            generation: currentQueryAuthGeneration(queryClient),
          });
      });
    return () => {
      persistence.cancel();
      unsubscribe();
      invalidateQueryAuthScope(queryClient);
    };
  }, [cacheScope, queryClient]);

  return {
    isOnline,
    isRestoring: !isNativeQueryRestoreComplete(restored, queryClient, cacheScope),
  };
}
