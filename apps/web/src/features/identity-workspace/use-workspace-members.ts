"use client";
import { useChangeMemberRoleMutation, useRemoveMemberMutation } from "./mutations";
import type { IdentityOrganizationMembership, OrganizationRole } from "./types";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceMembers(selection: WorkspaceSelection) {
  const change = useChangeMemberRoleMutation();
  const remove = useRemoveMemberMutation();
  const { organizationId, members, permissions } = selection.queries;
  return {
    members: members.data ?? [],
    currentUser: permissions.currentUser,
    access: selection.access,
    pending: change.isPending || remove.isPending,
    error: change.error ?? remove.error ?? members.error,
    changeRole: (membership: IdentityOrganizationMembership, role: OrganizationRole) => {
      if (organizationId && selection.access.rolesForMember(membership).includes(role))
        void change.run({ organizationId, membershipId: membership.id, role });
    },
    remove: (membership: IdentityOrganizationMembership) => {
      if (organizationId && selection.access.canManageMember(membership))
        void remove.run({ organizationId, membershipId: membership.id });
    },
  };
}
export type WorkspaceMembers = ReturnType<typeof useWorkspaceMembers>;
