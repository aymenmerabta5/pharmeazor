import type * as React from "react";
import { View } from "react-native";
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
    <View className="gap-3">
      <MembersCard
        model={model}
        loading={Boolean(selection.queries.organizationId) && selection.queries.members.isPending}
      />
      <WorkspaceError error={model.error} />
    </View>
  );
}
