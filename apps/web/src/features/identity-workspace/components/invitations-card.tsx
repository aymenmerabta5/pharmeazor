"use client";
import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceInvitations } from "../use-workspace-invitations";
import { InvitationRow } from "./invitation-row";

interface InvitationsCardProps {
  model: WorkspaceInvitations;
}

export function InvitationsCard({ model }: InvitationsCardProps): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const { form, invitations, pending, permissions } = model;
  const roleItems = [
    { label: t("roles.admin"), value: "admin" },
    { label: t("roles.member"), value: "member" },
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invitations")}</CardTitle>
        <CardDescription>{t("invitationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {model.canWrite ? (
          <form.AppForm>
            <Form form={form} className="flex flex-col gap-3">
              <FieldGroup className="grid sm:grid-cols-[1fr_9rem] sm:items-end">
                <form.AppField name="email">
                  {(field) => (
                    <field.TextField
                      type="email"
                      label={t("inviteEmail")}
                      placeholder={t("inviteEmailPlaceholder")}
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="role">
                  {(field) => <field.SelectField label={t("roleLabel")} options={roleItems} />}
                </form.AppField>
              </FieldGroup>
              <form.SubmitButton disabled={pending}>{t("invite")}</form.SubmitButton>
            </Form>
          </form.AppForm>
        ) : null}
        {!permissions.isPending && !permissions.hasError && !permissions.canReadInvitations ? (
          <p className="text-sm text-muted-foreground">{t("invitationsRestricted")}</p>
        ) : null}
        {permissions.canReadInvitations
          ? invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                pending={pending}
                canCancel={model.canCancel}
                canAccept={model.canAccept(invitation)}
                onAccept={() => model.accept(invitation)}
                onCancel={() => model.cancel(invitation)}
              />
            ))
          : null}
      </CardContent>
    </Card>
  );
}
