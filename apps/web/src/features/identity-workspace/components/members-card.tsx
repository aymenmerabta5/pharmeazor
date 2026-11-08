"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceMembers } from "../use-workspace-members";
import { MemberRow } from "./member-row";

export function MembersCard({ model }: { model: WorkspaceMembers }): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const members = model.members;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{t("members")}</CardTitle>
            <CardDescription>{t("membersPolicyDescription")}</CardDescription>
          </div>
          <Badge variant="secondary">{members.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {members.map((membership) => (
          <MemberRow key={membership.id} membership={membership} model={model} />
        ))}
      </CardContent>
    </Card>
  );
}
