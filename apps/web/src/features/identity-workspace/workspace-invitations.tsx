"use client";
import type * as React from "react";
import { InvitationsCard } from "./components/invitations-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspaceInvitations } from "./use-workspace-invitations";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function WorkspaceInvitations({
  selection,
}: {
  selection: WorkspaceSelection;
}): React.JSX.Element {
  const model = useWorkspaceInvitations(selection);
  return (
    <section className="flex flex-col gap-3">
      <InvitationsCard model={model} />
      <WorkspaceError error={model.error} />
    </section>
  );
}
