import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import type { BillingInitialData } from "@/features/billing/model";
import { BillingHeader } from "@/features/billing/components/billing-header";
import { BillingClientScreen } from "@/features/billing/screen";
import { ManualBillingPanel } from "@/features/manual-payments/screen";
const PROVIDERS: string[] = ["stripe", "chargily"];
async function BillingData(): Promise<React.JSX.Element> {
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
  const snapshot = await application.billing.subscriptions();
  const initialData = JSON.parse(JSON.stringify(snapshot)) as BillingInitialData;
  initialData.canCreatePaymentLinks = me.user.role === "admin" || me.user.role === "superAdmin";
  return (
    <RequestOwnedSnapshot scope={scope}>
      <BillingClientScreen providers={PROVIDERS} initialData={initialData} />
    </RequestOwnedSnapshot>
  );
}
export default function BillingPage(): React.JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <BillingHeader />
        <Suspense fallback={<QueryAuthStatus />}>
          <BillingData />
        </Suspense>
        <ManualBillingPanel />
      </div>
    </main>
  );
}
