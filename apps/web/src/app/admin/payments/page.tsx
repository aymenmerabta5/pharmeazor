import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { ManualAdminQueue } from "@/features/manual-payments/admin-queue";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

/**
 * The transfer review page.
 *
 * The queue already requires an administrator on the server, so this page only
 * fixes the account that owns the request and renders the queue.
 */
async function PaymentsData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const principal = application.principal;
  if (!principal) redirect("/sign-in");
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  return (
    <RequestOwnedSnapshot scope={scope}>
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10">
        <ManualAdminQueue />
      </main>
    </RequestOwnedSnapshot>
  );
}

export default function AdminPaymentsPage(): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<QueryAuthStatus />}>
        <PaymentsData />
      </Suspense>
    </>
  );
}
