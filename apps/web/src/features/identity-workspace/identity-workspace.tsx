"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import { WorkspaceInvitations } from "./workspace-invitations";
import { WorkspaceMembers } from "./workspace-members";
import { WorkspaceOrganizations } from "./workspace-organizations";
import { WorkspaceTeams } from "./workspace-teams";
import { useWorkspaceSelection } from "./use-workspace-selection";
import type { IdentityWorkspaceInitialData } from "./types";

export function IdentityWorkspace({
  initialData,
}: {
  initialData?: IdentityWorkspaceInitialData;
}): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const selection = useWorkspaceSelection(initialData);
  const { permissions, organizationId, teamId } = selection.queries;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">{t("kicker")}</p>
        <h2 className="text-3xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("webDescription")}</p>
      </div>
      {permissions.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("checkingPermissions")}
        </p>
      ) : null}
      {permissions.hasError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("permissionsUnavailable")}</AlertTitle>
          <AlertDescription>
            {t("permissionsUnavailableDescription")}
            <Button variant="outline" size="sm" onClick={() => void permissions.retry()}>
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-6">
          <WorkspaceOrganizations selection={selection} />
        </div>
        {organizationId ? (
          <div className="flex flex-col gap-6">
            <WorkspaceMembers key={"members:" + organizationId} selection={selection} />
            <WorkspaceTeams key={"teams:" + organizationId + ":" + teamId} selection={selection} />
            <WorkspaceInvitations key={"invitations:" + organizationId} selection={selection} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
