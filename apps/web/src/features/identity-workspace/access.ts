import type {
  IdentityOrganizationMembership,
  IdentityTeamMembership,
  OrganizationRole,
} from "./types";

export function compactIdentityId(value: string): string {
  return value.length > 16 ? value.slice(0, 8) + "…" + value.slice(-4) : value;
}

export function workspaceAccess(input: {
  organizationId: string | null;
  teamId: string | null;
  currentUser: { id: string; name: string | null; email: string } | null;
  members: readonly IdentityOrganizationMembership[];
  membersReady: boolean;
  teamMembers: readonly IdentityTeamMembership[];
  teamMembersReady: boolean;
  canWriteMembers: boolean;
  canWriteTeams: boolean;
  canWriteInvitations: boolean;
  isOwner: boolean;
}) {
  const members = input.members.filter((member) => member.organizationId === input.organizationId);
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const ready = Boolean(input.organizationId && input.currentUser);
  const canManageMember = (member: IdentityOrganizationMembership) =>
    ready &&
    input.membersReady &&
    input.canWriteMembers &&
    member.organizationId === input.organizationId &&
    (member.role !== "owner" || (input.isOwner && ownerCount > 1));
  return {
    canManageMember,
    rolesForMember(member: IdentityOrganizationMembership): OrganizationRole[] {
      if (!canManageMember(member)) return [member.role];
      return input.isOwner ? ["owner", "admin", "member"] : ["admin", "member"];
    },
    canWriteTeams: ready && input.canWriteTeams,
    canWriteInvitations: ready && input.canWriteInvitations,
    canActivateTeam:
      ready &&
      input.teamMembersReady &&
      Boolean(input.teamId) &&
      input.teamMembers.some(
        (member) => member.teamId === input.teamId && member.userId === input.currentUser?.id,
      ),
    availableTeamMembers:
      input.membersReady && input.teamMembersReady
        ? members.filter(
            (member) =>
              !input.teamMembers.some(
                (teamMember) =>
                  teamMember.teamId === input.teamId && teamMember.userId === member.userId,
              ),
          )
        : [],
  };
}
