import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { AccountBillingScreen } from "@/features/account-billing/account-billing-screen";
import { accountBillingSnapshot } from "@/features/account-billing/model";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

/**
 * The account's billing state.
 *
 * The plan and the balance are read together, because the page is making one
 * promise: what this account owns and what it can spend. An unverified account
 * still sees its balance but has no subscriptions to show yet.
 */
async function BillingData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const [catalog, summary, snapshot] = await Promise.all([
    application.billing.plans(),
    application.billing.manual.summary(),
    principal.emailVerified ? application.billing.subscriptions() : null,
  ]);
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  return (
    <RequestOwnedSnapshot scope={scope}>
      <AccountBillingScreen
        snapshot={accountBillingSnapshot({
          subscriptions: snapshot?.subscriptions ?? [],
          plans: snapshot?.plans ?? catalog.plans,
        })}
        balanceMinor={summary.balanceMinor}
      />
    </RequestOwnedSnapshot>
  );
}

export default function BillingSettingsPage(): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<QueryAuthStatus />}>
        <BillingData />
      </Suspense>
    </>
  );
}
