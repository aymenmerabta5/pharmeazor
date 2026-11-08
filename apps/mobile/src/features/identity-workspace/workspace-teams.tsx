import type * as React from "react";
import { View } from "react-native";
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
    <View className="gap-3">
      <TeamsCard
        model={model}
        loading={Boolean(selection.queries.organizationId) && selection.queries.teams.isPending}
      />
      <WorkspaceError error={model.error} />
    </View>
  );
}
