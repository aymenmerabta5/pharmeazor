import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { IdentityWorkspace } from "@/features/identity-workspace/identity-workspace";
import type { IdentityWorkspaceInitialData } from "@/features/identity-workspace/types";

async function WorkspaceData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  const initialData: IdentityWorkspaceInitialData = await application.identity.workspace.snapshot();
  return (
    <RequestOwnedSnapshot scope={scope}>
      <IdentityWorkspace initialData={initialData} />
    </RequestOwnedSnapshot>
  );
}

export default function WorkspacePage(): React.JSX.Element {
  return (
    <Suspense fallback={<QueryAuthStatus />}>
      <WorkspaceData />
    </Suspense>
  );
}
