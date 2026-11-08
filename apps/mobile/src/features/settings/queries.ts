"use client";
import { identityClient } from "@/lib/auth-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authScopedQueryKey,
  currentQueryAuthScope,
  queryInitialDataForScope,
  type QueryAuthScope,
} from "@/lib/query-client";
import { orpc } from "@/lib/orpc";
import type { IdentitySessionInitialData, IdentitySessionsInitialState } from "./model";

export function useSettingsIdentityQuery() {
  const session = identityClient.useSession();
  const scope = currentQueryAuthScope(useQueryClient());
  const options = orpc.me.queryOptions();
  const application = useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "settings-identity"],
    enabled: Boolean(scope),
  });
  return {
    user: application.data?.user,
    isPending: session.isPending || Boolean(session.data?.user && application.isPending),
    error: session.error ?? application.error,
    sessionId: session.data?.session.id,
    twoFactorEnabled: session.data?.user
      ? Reflect.get(session.data.user, "twoFactorEnabled") === true
      : false,
    retry: async () => {
      await Promise.all([session.refetch(), application.refetch()]);
    },
  };
}

export function identitySessionsQueryKey(scope: QueryAuthScope) {
  return authScopedQueryKey(scope, orpc.identity.sessions.list.key({ type: "query" }));
}
export function identitySessionsQueryOptions(
  scope: QueryAuthScope | null,
  initialData?: IdentitySessionInitialData[],
  initialScope?: QueryAuthScope,
) {
  const options = orpc.identity.sessions.list.queryOptions({
    input: {},
    initialData: queryInitialDataForScope(scope, initialScope, initialData),
  });
  return {
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "identity-sessions"],
    enabled: Boolean(scope),
  };
}
export function useSettingsSessionsQuery({
  initialSessions,
  initialScope,
}: IdentitySessionsInitialState) {
  const queryClient = useQueryClient();
  const session = identityClient.useSession();
  const scope =
    currentQueryAuthScope(queryClient) ?? (session.isPending ? (initialScope ?? null) : null);
  return useQuery(identitySessionsQueryOptions(scope, initialSessions, initialScope));
}
