"use client";
import { useForm } from "@tanstack/react-form";
import { teamSchema, teamMemberSchema } from "./schema";
import {
  useActivateTeamMutation,
  useAddTeamMemberMutation,
  useCreateTeamMutation,
  useRemoveTeamMemberMutation,
} from "./mutations";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceTeams(selection: WorkspaceSelection) {
  const create = useCreateTeamMutation();
  const activate = useActivateTeamMutation();
  const add = useAddTeamMemberMutation();
  const remove = useRemoveTeamMemberMutation();
  const { organizationId, teamId, teams, teamMembers, members, permissions } = selection.queries;
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: teamSchema },
    onSubmit: async ({ value }) => {
      if (!organizationId || !selection.access.canWriteTeams) return;
      const ownsSelection = selection.captureSelection();
      const outcome = await create.run({ organizationId, name: value.name.trim() });
      if (outcome.status !== "success" || !outcome.isCurrent() || !ownsSelection()) return;
      form.reset();
      selection.selectTeam(outcome.data.team.id);
    },
  });
  const memberForm = useForm({
    defaultValues: { userId: "" },
    validators: { onSubmit: teamMemberSchema },
    onSubmit: async ({ value }) => {
      if (
        !organizationId ||
        !teamId ||
        !selection.access.canWriteTeams ||
        !selection.access.availableTeamMembers.some((member) => member.userId === value.userId)
      )
        return;
      const ownsSelection = selection.captureSelection();
      const outcome = await add.run({ organizationId, teamId, userId: value.userId });
      if (outcome.status === "success" && outcome.isCurrent() && ownsSelection())
        memberForm.reset();
    },
  });
  return {
    form,
    memberForm,
    teamId,
    teams: teams.data ?? [],
    teamMembers: teamMembers.data ?? [],
    currentUser: permissions.currentUser,
    access: selection.access,
    membersReady: members.isSuccess && teamMembers.isSuccess,
    pending: create.isPending || activate.isPending || add.isPending || remove.isPending,
    error:
      create.error ??
      activate.error ??
      add.error ??
      remove.error ??
      teams.error ??
      teamMembers.error,
    select: selection.selectTeam,
    activate: () => {
      if (organizationId && teamId && selection.access.canActivateTeam)
        void activate.run({ organizationId, teamId });
    },
    removeMember: (userId: string) => {
      if (organizationId && teamId && selection.access.canWriteTeams)
        void remove.run({ organizationId, teamId, userId });
    },
  };
}
export type WorkspaceTeams = ReturnType<typeof useWorkspaceTeams>;
