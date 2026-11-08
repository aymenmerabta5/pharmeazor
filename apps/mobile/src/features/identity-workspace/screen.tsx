import type * as React from "react";
import { ScrollView, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useWorkspaceSelection } from "./use-workspace-selection";
import { WorkspaceOrganizations } from "./workspace-organizations";
import { WorkspaceMembers } from "./workspace-members";
import { WorkspaceTeams } from "./workspace-teams";
import { WorkspaceInvitations } from "./workspace-invitations";
import { useTranslations } from "@/lib/i18n";
export function WorkspaceScreen(): React.JSX.Element {
  const t = useTranslations("workspace");
  const selection = useWorkspaceSelection();
  const { organizationId, teamId, permissions } = selection.queries;
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic">
      <View className="w-full max-w-[960px] self-center gap-5 p-5">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
            {t("kicker")}
          </Text>
          <Text className="text-3xl font-bold tracking-tight">{t("title")}</Text>
          <Text className="text-sm text-muted-foreground">{t("mobileDescription")}</Text>
        </View>
        {permissions.isPending ? (
          <Text accessibilityLiveRegion="polite">{t("checkingPermissions")}</Text>
        ) : null}
        {permissions.hasError ? (
          <Alert variant="destructive" accessibilityRole="alert">
            <AlertDescription>{t("permissionsUnavailableDescription")}</AlertDescription>
            <Button variant="outline" onPress={() => void permissions.retry()}>
              <Text>{t("retry")}</Text>
            </Button>
          </Alert>
        ) : null}
        <WorkspaceOrganizations selection={selection} />
        {organizationId ? (
          <>
            <WorkspaceMembers key={"members:" + organizationId} selection={selection} />
            <WorkspaceTeams key={"teams:" + organizationId + ":" + teamId} selection={selection} />
            <WorkspaceInvitations key={"invitations:" + organizationId} selection={selection} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
