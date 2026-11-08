"use client";
import { useForm } from "@tanstack/react-form";
import { invitationSchema } from "./schema";
import {
  useAcceptInvitationMutation,
  useCancelInvitationMutation,
  useInviteMemberMutation,
} from "./mutations";
import type { IdentityInvitation, OrganizationRole } from "./types";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceInvitations(selection: WorkspaceSelection) {
  const invite = useInviteMemberMutation();
  const accept = useAcceptInvitationMutation();
  const cancel = useCancelInvitationMutation();
  const { organizationId, invitations, permissions } = selection.queries;
  const form = useForm({
    defaultValues: { email: "", role: "member" as OrganizationRole },
    validators: { onSubmit: invitationSchema },
    onSubmit: async ({ value }) => {
      if (!organizationId || !selection.access.canWriteInvitations) return;
      const ownsSelection = selection.captureSelection();
      const outcome = await invite.run({
        organizationId,
        email: value.email.trim(),
        role: value.role,
      });
      if (outcome.status === "success" && outcome.isCurrent() && ownsSelection()) form.reset();
    },
  });
  const canAccept = (invitation: IdentityInvitation) =>
    invitations.isSuccess &&
    invitation.email.trim().toLocaleLowerCase("en-US") ===
      permissions.currentUser?.email.trim().toLocaleLowerCase("en-US");
  return {
    form,
    permissions,
    canAccept,
    invitations: invitations.data ?? [],
    canWrite: selection.access.canWriteInvitations,
    canCancel: selection.access.canWriteInvitations && invitations.isSuccess,
    pending: invite.isPending || accept.isPending || cancel.isPending,
    error: invite.error ?? accept.error ?? cancel.error ?? invitations.error,
    accept: (invitation: IdentityInvitation) => {
      if (canAccept(invitation)) void accept.run({ invitationId: invitation.id });
    },
    cancel: (invitation: IdentityInvitation) => {
      if (selection.access.canWriteInvitations && invitations.isSuccess)
        void cancel.run({ invitationId: invitation.id });
    },
  };
}
export type WorkspaceInvitations = ReturnType<typeof useWorkspaceInvitations>;
