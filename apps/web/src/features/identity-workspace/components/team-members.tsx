"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import { compactIdentityId } from "../access";
import type { WorkspaceTeams } from "../use-workspace-teams";
import { MemberIdentity } from "./member-identity";

export function TeamMembers({ model }: { model: WorkspaceTeams }): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const { access, memberForm, pending, currentUser, teamId, teamMembers } = model;
  const memberItems = access.availableTeamMembers.map((member) => ({
    value: member.userId,
    label:
      member.userId === currentUser?.id
        ? currentUser?.name?.trim() || t("you")
        : t("memberLabel") + " " + compactIdentityId(member.userId),
  }));
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {access.canWriteTeams && teamId ? (
        memberItems.length > 0 ? (
          <memberForm.AppForm>
            <Form form={memberForm} className="flex flex-col gap-3">
              <memberForm.AppField name="userId">
                {(field) => <field.SelectField label={t("selectMember")} options={memberItems} />}
              </memberForm.AppField>
              <memberForm.SubmitButton disabled={pending}>{t("addMember")}</memberForm.SubmitButton>
            </Form>
          </memberForm.AppForm>
        ) : model.membersReady ? (
          <p className="text-sm text-muted-foreground">{t("noEligibleMembers")}</p>
        ) : null
      ) : null}
      {teamMembers.map((membership) => (
        <div
          key={membership.userId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
        >
          <MemberIdentity userId={membership.userId} currentUser={currentUser} />
          {access.canWriteTeams ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !model.membersReady}
              onClick={() => model.removeMember(membership.userId)}
            >
              {t("remove")}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
