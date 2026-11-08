import type * as React from "react";
import { View } from "react-native";
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
    <View className="gap-3">
      <InvitationsCard
        model={model}
        loading={
          Boolean(selection.queries.organizationId) && selection.queries.invitations.isPending
        }
      />
      <WorkspaceError error={model.error} />
    </View>
  );
}
