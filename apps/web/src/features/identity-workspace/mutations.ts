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
import {
  createOrganizationAction,
  setActiveOrganizationAction,
  createTeamAction,
  setActiveTeamAction,
  createInvitationAction,
  cancelInvitationAction,
  acceptInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
  addTeamMemberAction,
  removeTeamMemberAction,
} from "@/app/settings/workspace/actions";

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
        ...keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        queryClient.invalidateQueries({ queryKey: identityWorkspaceInitialQueryKey(scope) }),
      ]);
      if (!isCurrent()) return;
    },
  });
}

export function useCreateOrganizationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.create.call>[0]) =>
      createOrganizationAction(input),
    false,
  );
}

export function useActivateOrganizationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.setActive.call>[0]) =>
      setActiveOrganizationAction(input),
    true,
  );
}

export function useCreateTeamMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.create.call>[0]) => createTeamAction(input),
    false,
  );
}

export function useActivateTeamMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.setActive.call>[0]) => setActiveTeamAction(input),
    true,
  );
}

export function useInviteMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.create.call>[0]) =>
      createInvitationAction(input),
    false,
  );
}

export function useCancelInvitationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.cancel.call>[0]) =>
      cancelInvitationAction(input),
    false,
  );
}

export function useAcceptInvitationMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.invitations.accept.call>[0]) =>
      acceptInvitationAction(input),
    false,
  );
}

export function useChangeMemberRoleMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.changeMemberRole.call>[0]) =>
      changeMemberRoleAction(input),
    false,
  );
}

export function useRemoveMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.organizations.removeMember.call>[0]) =>
      removeMemberAction(input),
    true,
  );
}

export function useAddTeamMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.addMember.call>[0]) => addTeamMemberAction(input),
    false,
  );
}

export function useRemoveTeamMemberMutation() {
  return useWorkspaceWrite(
    (input: Parameters<typeof orpc.identity.teams.removeMember.call>[0]) =>
      removeTeamMemberAction(input),
    true,
  );
}
