"use client";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { currentQueryAuthGeneration, type QueryAuthScope } from "@/lib/query-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations as useMessages } from "@/lib/translations";
import { orpcClient } from "@/lib/orpc";
import { useCanonicalQueryAuthScope } from "@/lib/query-auth-scope";
const readCurrentRequest = () => orpcClient.me();

interface QueryAuthSession {
  scope: QueryAuthScope | null;
  currentRequest: {
    user: { id: string; email: string; name: string | null; role: string | null } | null;
  } | null;
  isPending: boolean;
  error: Error | null;
  retry(): void;
  hasCanonicalApi: boolean;
}

const QueryAuthContext = React.createContext<QueryAuthSession | null>(null);
export function useQueryAuthSession(): QueryAuthSession | null {
  return React.useContext(QueryAuthContext);
}
const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function QueryAuthStatus({
  error = false,
  retry,
}: {
  error?: boolean;
  retry?(): void;
}): React.JSX.Element {
  const common = useMessages("common");
  const errors = useMessages("errors");
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6" aria-busy={!error}>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{errors("genericTitle")}</AlertTitle>
          <AlertDescription>{errors("genericDescription")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {common("loading")}
          </p>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </>
      )}
      {retry ? (
        <Button className="self-start" type="button" variant="outline" onClick={retry}>
          {common("retry")}
        </Button>
      ) : null}
    </section>
  );
}

export function QueryAuthCacheBoundary({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}): React.JSX.Element {
  const session = authClient.useSession();
  const hydrated = React.useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const canonical = useCanonicalQueryAuthScope(
    queryClient,
    session.data,
    session.isPending,
    readCurrentRequest,
  );
  const state: QueryAuthSession = { ...canonical, hasCanonicalApi: true };
  const generation = currentQueryAuthGeneration(queryClient);
  return (
    <QueryAuthContext.Provider value={state}>
      {hydrated && (state.isPending || state.error) ? (
        <QueryAuthStatus error={Boolean(state.error)} retry={state.retry} />
      ) : (
        <React.Fragment key={generation}>{children}</React.Fragment>
      )}
    </QueryAuthContext.Provider>
  );
}
