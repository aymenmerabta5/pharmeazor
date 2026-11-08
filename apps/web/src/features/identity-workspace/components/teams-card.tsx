"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceTeams } from "../use-workspace-teams";
import { TeamMembers } from "./team-members";

export function TeamsCard({ model }: { model: WorkspaceTeams }): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const { access, form, pending, teamId, teams } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("teams")}</CardTitle>
        <CardDescription>{t("teamsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {teams.length > 0 ? (
          <ToggleGroup
            value={teamId ? [teamId] : []}
            onValueChange={(values: string[]) => {
              const selected = values[0];
              if (selected) model.select(selected);
            }}
            spacing={2}
            aria-label={t("selectTeam")}
          >
            {teams.map((team) => (
              <ToggleGroupItem key={team.id} value={team.id}>
                {team.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        {access.canWriteTeams ? (
          <form.AppForm>
            <Form form={form} className="flex flex-col gap-3">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={t("teamName")}
                    placeholder={t("teamNamePlaceholder")}
                    required
                    maxLength={100}
                  />
                )}
              </form.AppField>
              <form.SubmitButton disabled={pending}>{t("create")}</form.SubmitButton>
            </Form>
          </form.AppForm>
        ) : null}
        {teamId ? (
          <Button
            variant="outline"
            disabled={pending || !access.canActivateTeam}
            onClick={model.activate}
          >
            {t("useSelectedTeam")}
          </Button>
        ) : null}
        {teamId && model.currentUser && model.membersReady && !access.canActivateTeam ? (
          <p className="text-sm text-muted-foreground">{t("teamMembershipRequired")}</p>
        ) : null}
        <TeamMembers model={model} />
      </CardContent>
    </Card>
  );
}
