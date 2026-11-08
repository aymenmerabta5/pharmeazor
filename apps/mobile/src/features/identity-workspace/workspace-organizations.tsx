import type * as React from "react";
import { View } from "react-native";
import { OrganizationsCard } from "./components/organizations-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspaceOrganizations } from "./use-workspace-organizations";
import type { WorkspaceSelection } from "./use-workspace-selection";
export function WorkspaceOrganizations({
  selection,
}: {
  selection: WorkspaceSelection;
}): React.JSX.Element {
  const model = useWorkspaceOrganizations(selection);
  return (
    <View className="gap-3">
      <OrganizationsCard model={model} />
      <WorkspaceError error={model.error} />
    </View>
  );
}
