import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { compactIdentityId } from "../access";
import type { WorkspaceTeams } from "../use-workspace-teams";
import { useTranslations } from "@/lib/i18n";

export function TeamsCard({
  model,
  loading,
}: {
  model: WorkspaceTeams;
  loading: boolean;
}): React.JSX.Element {
  const t = useTranslations("workspace");
  const { form, memberForm } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("teams")}</CardTitle>
        <CardDescription>{t("teamsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {loading ? <ActivityIndicator accessibilityLabel={t("teams")} /> : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {model.teams.map((team) => (
            <Button
              key={team.id}
              size="sm"
              accessibilityState={{ selected: team.id === model.teamId }}
              variant={team.id === model.teamId ? "default" : "outline"}
              onPress={() => model.select(team.id)}
            >
              <Text>{team.name}</Text>
            </Button>
          ))}
        </ScrollView>
        {model.access.canWriteTeams ? (
          <>
            <form.Field name="name">
              {(field) => (
                <View className="gap-1">
                  <Text>{t("teamName")}</Text>
                  <Input
                    accessibilityLabel={t("teamName")}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    maxLength={100}
                  />
                </View>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.errors.length}>
              {(errors) =>
                errors ? (
                  <Text accessibilityRole="alert" className="text-destructive">
                    {t("operationError")}
                  </Text>
                ) : null
              }
            </form.Subscribe>
            <Button disabled={model.pending} onPress={() => void form.handleSubmit()}>
              <Text>{t("create")}</Text>
            </Button>
          </>
        ) : null}
        {model.access.canActivateTeam ? (
          <Button variant="outline" disabled={model.pending} onPress={model.activate}>
            <Text>{t("setActiveTeam")}</Text>
          </Button>
        ) : null}
        {model.teamId && model.access.canWriteTeams && model.membersReady ? (
          <>
            <memberForm.Field name="userId">
              {(field) => (
                <View className="gap-2">
                  <Text>{t("memberUserId")}</Text>
                  {model.access.availableTeamMembers.map((member) => (
                    <Button
                      key={member.userId}
                      variant={field.state.value === member.userId ? "default" : "outline"}
                      disabled={model.pending}
                      onPress={() => field.handleChange(member.userId)}
                    >
                      <Text>
                        {member.userId === model.currentUser?.id
                          ? model.currentUser?.name || compactIdentityId(member.userId)
                          : compactIdentityId(member.userId)}
                      </Text>
                    </Button>
                  ))}
                </View>
              )}
            </memberForm.Field>
            <Button disabled={model.pending} onPress={() => void memberForm.handleSubmit()}>
              <Text>{t("add")}</Text>
            </Button>
          </>
        ) : null}
        {model.teamMembers.map((member) => (
          <View
            key={member.userId}
            className="flex-row items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <Text>
              {member.userId === model.currentUser?.id
                ? model.currentUser?.name || compactIdentityId(member.userId)
                : compactIdentityId(member.userId)}
            </Text>
            {model.access.canWriteTeams ? (
              <Button
                size="sm"
                variant="outline"
                disabled={model.pending}
                onPress={() => model.removeMember(member.userId)}
              >
                <Text>{t("remove")}</Text>
              </Button>
            ) : null}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}
