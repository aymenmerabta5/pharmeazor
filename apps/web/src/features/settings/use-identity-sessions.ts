"use client";
import { useSettingsIdentityQuery, useSettingsSessionsQuery } from "./queries";
import { useRevokeSessionMutation } from "./mutations";
import type { IdentitySessionsInitialState } from "./model";
export function useIdentitySessions(initial: IdentitySessionsInitialState) {
  const identity = useSettingsIdentityQuery();
  const query = useSettingsSessionsQuery(initial);
  const mutation = useRevokeSessionMutation();
  const variables = mutation.variables;
  return {
    currentSessionId: identity.sessionId,
    sessions: (query.data ?? []).filter((session) => session.revokedAt === null),
    error: query.error ?? mutation.error,
    isLoading: query.isPending,
    isRefreshing: query.isFetching,
    readSucceeded: query.isSuccess,
    pendingSessionId:
      mutation.isPending && variables && "sessionId" in variables ? variables.sessionId : undefined,
    isRevokingOthers: mutation.isPending && Boolean(variables && "others" in variables),
    refresh: () => {
      void query.refetch();
    },
    revokeSession: (sessionId: string) => {
      if (sessionId !== identity.sessionId) void mutation.run({ sessionId });
    },
    revokeOtherSessions: () => {
      void mutation.run({ others: true });
    },
  };
}
export type IdentitySessions = ReturnType<typeof useIdentitySessions>;
