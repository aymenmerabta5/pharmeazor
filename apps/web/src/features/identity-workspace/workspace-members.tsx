"use client";
import type * as React from "react";
import { MembersCard } from "./components/members-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspaceMembers } from "./use-workspace-members";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function WorkspaceMembers({
  selection,
}: {
  selection: WorkspaceSelection;
}): React.JSX.Element {
  const model = useWorkspaceMembers(selection);
  return (
    <section className="flex flex-col gap-3">
      <MembersCard model={model} />
      <WorkspaceError error={model.error} />
    </section>
  );
}
