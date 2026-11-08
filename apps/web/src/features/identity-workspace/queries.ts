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
  const organizations = useQuery(
    orpc.identity.organizations.list.queryOptions({
      input: {},
      initialData: initialData?.organizations,
    }),
  );
  const organizationId =
    selectedOrganizationId ?? initialData?.organizationId ?? organizations.data?.[0]?.id ?? null;
  const isInitialOrganization =
    organizationId !== null && organizationId === initialData?.organizationId;
  const teams = useQuery(
    orpc.identity.teams.list.queryOptions({
      input: { organizationId: organizationId ?? "" },
      enabled: Boolean(organizationId),
      initialData: isInitialOrganization ? initialData?.teams : undefined,
    }),
  );
  const teamId =
    selectedTeamId ??
    (isInitialOrganization ? initialData?.teamId : null) ??
    teams.data?.[0]?.id ??
    null;
  const members = useQuery(
    orpc.identity.organizations.listMembers.queryOptions({
      input: { organizationId: organizationId ?? "" },
      enabled: Boolean(organizationId),
      initialData: isInitialOrganization ? initialData?.members : undefined,
    }),
  );
  const permissions = useWorkspacePermissions(organizationId);
  const invitations = useQuery(
    orpc.identity.invitations.list.queryOptions({
      input: { organizationId: organizationId ?? "" },
      enabled: Boolean(organizationId) && permissions.canReadInvitations,
      initialData:
        isInitialOrganization && permissions.canReadInvitations
          ? initialData?.invitations
          : undefined,
    }),
  );
  const teamMembers = useQuery(
    orpc.identity.teams.listMembers.queryOptions({
      input: { organizationId: organizationId ?? "", teamId: teamId ?? "" },
      enabled: Boolean(organizationId && teamId),
      initialData:
        isInitialOrganization && teamId === initialData?.teamId
          ? initialData.teamMembers
          : undefined,
    }),
  );
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
