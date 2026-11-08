"use client";
import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import {
  authScopedQueryKey,
  currentQueryAuthScope,
  identityWorkspaceInitialQueryKey,
  requestQueryAuthScopeRefresh,
} from "@/lib/query-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";

function useWorkspaceWrite<Input, Output>(
  operation: (input: Input) => Promise<Output>,
  refreshIdentity = false,
) {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(operation, {
    onSuccess: async (_output, _input, isCurrent) => {
      const scope = currentQueryAuthScope(queryClient);
      if (!scope) return;
      if (refreshIdentity) {
        requestQueryAuthScopeRefresh(queryClient);
        return;
      }
      const keys = [
        orpc.identity.organizations.list.key({ type: "query" }),
        orpc.identity.organizations.listMembers.key({ type: "query" }),
        orpc.identity.organizations.hasPermission.key({ type: "query" }),
        orpc.identity.teams.list.key({ type: "query" }),
        orpc.identity.teams.listMembers.key({ type: "query" }),
        orpc.identity.invitations.list.key({ type: "query" }),
      ];
      await Promise.all([
        ...keys.map((key) =>
          queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, key) }),
        ),
        queryClient.invalidateQueries({ queryKey: identityWorkspaceInitialQueryKey(scope) }),
      ]);
      if (!isCurrent()) return;
    },
  });
}

export function useCreateOrganizationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.create.call>[0]) =>
      orpc.identity.organizations.create.call(input),
    false,
  );
}

export function useActivateOrganizationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.setActive.call>[0]) =>
      orpc.identity.organizations.setActive.call(input),
    true,
  );
}

export function useCreateTeamMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.create.call>[0]) =>
      orpc.identity.teams.create.call(input),
    false,
  );
}

export function useActivateTeamMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.setActive.call>[0]) =>
      orpc.identity.teams.setActive.call(input),
    true,
  );
}

export function useInviteMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.create.call>[0]) =>
      orpc.identity.invitations.create.call(input),
    false,
  );
}

export function useCancelInvitationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.cancel.call>[0]) =>
      orpc.identity.invitations.cancel.call(input),
    false,
  );
}

export function useAcceptInvitationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.accept.call>[0]) =>
      orpc.identity.invitations.accept.call(input),
    false,
  );
}

export function useChangeMemberRoleMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.changeMemberRole.call>[0]) =>
      orpc.identity.organizations.changeMemberRole.call(input),
    false,
  );
}

export function useRemoveMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.removeMember.call>[0]) =>
      orpc.identity.organizations.removeMember.call(input),
    true,
  );
}

export function useAddTeamMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.addMember.call>[0]) =>
      orpc.identity.teams.addMember.call(input),
    false,
  );
}

export function useRemoveTeamMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.removeMember.call>[0]) =>
      orpc.identity.teams.removeMember.call(input),
    true,
  );
}
