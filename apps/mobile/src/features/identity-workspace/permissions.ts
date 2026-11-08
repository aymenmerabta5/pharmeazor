export const WORKSPACE_PERMISSIONS = [
  "member:write",
  "team:write",
  "invitation:read",
  "invitation:write",
  "organization:write",
] as const;

interface QueryState<T> {
  data?: T;
  isSuccess: boolean;
  isPending: boolean;
  isError: boolean;
}

export function resolveWorkspacePermissions(
  authenticated: boolean,
  organizationId: string | null,
  me: QueryState<{ user: { id: string; name: string | null; email: string } | null }>,
  checks: readonly QueryState<{ allowed: boolean }>[],
) {
  const queries = [me, ...checks];
  const ready =
    Boolean(authenticated && organizationId && me.isSuccess && me.data?.user) &&
    checks.length === WORKSPACE_PERMISSIONS.length &&
    queries.every((query) => query.isSuccess);
  const allowed = (index: number) => ready && checks[index]?.data?.allowed === true;
  return {
    currentUser: authenticated && me.isSuccess ? (me.data?.user ?? null) : null,
    canWriteMembers: allowed(0),
    canWriteTeams: allowed(1),
    canReadInvitations: allowed(2),
    canWriteInvitations: allowed(3),
    isOwner: allowed(4),
    isPending: Boolean(organizationId) && queries.some((query) => query.isPending),
    hasError: Boolean(organizationId) && queries.some((query) => query.isError),
  };
}
