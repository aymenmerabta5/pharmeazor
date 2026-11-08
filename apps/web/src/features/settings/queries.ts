"use client";
import { identityClient, identityPasskeyClient } from "@/lib/auth-client";
import { useRef } from "react";
import { useQueryAuthSession } from "@/components/query-auth-boundary";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authScopedQueryKey,
  currentQueryAuthScope,
  queryInitialDataForScope,
  type QueryAuthScope,
  currentQueryAuthGeneration,
  queryAuthIdentityFromSession,
  queryAuthIdentitySignature,
  type QueryAuthIdentity,
} from "@/lib/query-client";
import { orpc } from "@/lib/orpc";
import type { IdentitySessionInitialData, IdentitySessionsInitialState } from "./model";

export function useSettingsIdentityQuery() {
  const sessionState = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const user = canonical?.hasCanonicalApi
    ? canonical.currentRequest?.user
    : sessionState.data?.user;
  return {
    user,
    isPending: canonical?.hasCanonicalApi ? canonical.isPending : sessionState.isPending,
    error: canonical?.hasCanonicalApi ? canonical.error : sessionState.error,
    sessionId: sessionState.data?.session.id,
    twoFactorEnabled: sessionState.data?.user
      ? Reflect.get(sessionState.data.user, "twoFactorEnabled") === true
      : false,
  };
}
export function passkeyListQueryOptions(owner: QueryAuthIdentity | null, isCurrent: () => boolean) {
  return {
    queryKey: owner
      ? authScopedQueryKey({ ...owner, tenantId: null, teamId: null }, ["identity", "passkeys"])
      : ["auth", "anonymous", "passkeys"],
    enabled: Boolean(owner) && typeof window !== "undefined",
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      if (!owner || !isCurrent())
        throw new DOMException("Passkey request owner changed", "AbortError");
      const result = await identityPasskeyClient.list({ signal });
      signal.throwIfAborted();
      if (!isCurrent()) throw new DOMException("Passkey request owner changed", "AbortError");
      if (result.error) throw new Error("Passkeys could not be loaded", { cause: result.error });
      return result.data ?? [];
    },
  };
}

export function usePasskeyListQuery() {
  const queryClient = useQueryClient();
  const captureOwner = useAuthOwnedEffect();
  const session = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const provider =
    session.isPending || session.error ? null : queryAuthIdentityFromSession(session.data);
  const admitted =
    !canonical?.hasCanonicalApi ||
    (!canonical.isPending &&
      !canonical.error &&
      canonical.scope !== null &&
      queryAuthIdentitySignature(canonical.scope) === queryAuthIdentitySignature(provider));
  const owner = admitted ? provider : null;
  const signature = queryAuthIdentitySignature(owner);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  const generation = currentQueryAuthGeneration(queryClient);
  return useQuery(
    passkeyListQueryOptions(owner, () => {
      const isMountedOwner = captureOwner();
      return (
        latestSignature.current === signature &&
        currentQueryAuthGeneration(queryClient) === generation &&
        isMountedOwner()
      );
    }),
  );
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
    enabled: Boolean(scope) && typeof window !== "undefined",
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
