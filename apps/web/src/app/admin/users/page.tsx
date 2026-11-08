import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { AdminUsersFeature } from "@/features/admin-users";
import { DEFAULT_ADMIN_USERS_FILTERS } from "@/features/admin-users/types";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";

async function AdminUsersData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const principal = application.principal;
  if (!principal) redirect("/sign-in");
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  const data = await application.admin.listUsers(DEFAULT_ADMIN_USERS_FILTERS);
  const initialData = {
    total: data.total,
    users: data.users.map((user) => ({ ...user, identityId: user.id })),
  };
  return (
    <RequestOwnedSnapshot scope={scope}>
      <AdminUsersFeature initialData={initialData} />
    </RequestOwnedSnapshot>
  );
}

export default function AdminUsersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<QueryAuthStatus />}>
      <AdminUsersData />
    </Suspense>
  );
}
