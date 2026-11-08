"use client";
import type * as React from "react";
import { TeamsCard } from "./components/teams-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspaceTeams } from "./use-workspace-teams";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function WorkspaceTeams({
  selection,
}: {
  selection: WorkspaceSelection;
}): React.JSX.Element {
  const model = useWorkspaceTeams(selection);
  return (
    <section className="flex flex-col gap-3">
      <TeamsCard model={model} />
      <WorkspaceError error={model.error} />
    </section>
  );
}
