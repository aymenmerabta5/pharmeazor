"use client";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope } from "@/lib/query-client";

import type { IdentityWorkspaceInitialData } from "./types";
import { WORKSPACE_PERMISSIONS, resolveWorkspacePermissions } from "./permissions";

function useWorkspacePermissions(organizationId: string | null) {
  const scope = currentQueryAuthScope(useQueryClient());
  const meOptions = orpc.me.queryOptions();
  const me = useQuery({
    ...meOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, meOptions.queryKey)
      : ["auth", "anonymous", "workspace-user"],
    enabled: Boolean(scope),
  });
  const checks = useQueries({
    queries: WORKSPACE_PERMISSIONS.map((permission) => {
      const options = orpc.identity.organizations.hasPermission.queryOptions({
        input: { organizationId: organizationId ?? "", permission },
      });
      return {
        ...options,
        queryKey: scope
          ? authScopedQueryKey(scope, options.queryKey)
          : ["auth", "anonymous", "workspace-permission", permission],
        enabled: Boolean(scope && organizationId),
      };
    }),
  });
  return {
    ...resolveWorkspacePermissions(Boolean(scope), organizationId, me, checks),
    retry: async () => {
      await Promise.all([me, ...checks].map((query) => query.refetch()));
    },
  };
}

export function useIdentityWorkspaceQueries(
  selectedOrganizationId: string | null,
  selectedTeamId: string | null,
  initialData?: IdentityWorkspaceInitialData,
) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const effectiveInitialData = initialData;
  const organizationsOptions = orpc.identity.organizations.list.queryOptions({
    input: {},
    initialData: effectiveInitialData?.organizations,
  });
  const organizations = useQuery({
    ...organizationsOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, organizationsOptions.queryKey)
      : ["auth", "anonymous", "organizations"],
    enabled: Boolean(scope),
  });
  const organizationId =
    selectedOrganizationId ??
    effectiveInitialData?.organizationId ??
    organizations.data?.[0]?.id ??
    null;
  const isInitialOrganization =
    organizationId !== null && organizationId === effectiveInitialData?.organizationId;
  const teamsOptions = orpc.identity.teams.list.queryOptions({
    input: { organizationId: organizationId ?? "" },
    initialData: isInitialOrganization ? effectiveInitialData?.teams : undefined,
  });
  const teams = useQuery({
    ...teamsOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, teamsOptions.queryKey)
      : ["auth", "anonymous", "teams"],
    enabled: Boolean(scope && organizationId),
  });
  const teamId =
    selectedTeamId ??
    (isInitialOrganization ? effectiveInitialData?.teamId : null) ??
    teams.data?.[0]?.id ??
    null;
  const membersOptions = orpc.identity.organizations.listMembers.queryOptions({
    input: { organizationId: organizationId ?? "" },
    initialData: isInitialOrganization ? effectiveInitialData?.members : undefined,
  });
  const members = useQuery({
    ...membersOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, membersOptions.queryKey)
      : ["auth", "anonymous", "members"],
    enabled: Boolean(scope && organizationId),
  });
  const permissions = useWorkspacePermissions(organizationId);
  const invitationsOptions = orpc.identity.invitations.list.queryOptions({
    input: { organizationId: organizationId ?? "" },
    initialData: isInitialOrganization ? effectiveInitialData?.invitations : undefined,
  });
  const invitations = useQuery({
    ...invitationsOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, invitationsOptions.queryKey)
      : ["auth", "anonymous", "invitations"],
    enabled: Boolean(scope && organizationId) && permissions.canReadInvitations,
  });
  const teamMembersOptions = orpc.identity.teams.listMembers.queryOptions({
    input: { organizationId: organizationId ?? "", teamId: teamId ?? "" },
    initialData:
      isInitialOrganization && teamId === effectiveInitialData?.teamId
        ? effectiveInitialData.teamMembers
        : undefined,
  });
  const teamMembers = useQuery({
    ...teamMembersOptions,
    queryKey: scope
      ? authScopedQueryKey(scope, teamMembersOptions.queryKey)
      : ["auth", "anonymous", "team-members"],
    enabled: Boolean(scope && organizationId && teamId),
  });
  return {
    invitations,
    members,
    organizationId,
    organizations,
    permissions,
    teamId,
    teamMembers,
    teams,
  };
}
