import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isAdminRole } from "@repo/auth/roles";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { HomePage } from "@/features/home/page";
import { LandingSkeleton } from "@/features/home/components/landing-skeleton";
import { canOpenAgent } from "@/lib/agent-access";
import { isLiveSubscription, normalizeBillingSubscriptions } from "@/lib/billing-catalog";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

/**
 * The public landing page.
 *
 * A subscriber who reaches `/` is already inside the product, so the server
 * sends them to the agent instead of showing the sales page again. An
 * administrator is sent there too: the assistant is sponsored for that role,
 * so the pricing page is not a step they need. The subscription read only
 * happens when a verified session exists.
 */
async function LandingData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const signedIn = Boolean(me.user);
  if (me.user && application.principal?.emailVerified) {
    const isAdmin = isAdminRole(application.principal.role);
    const snapshot = await application.billing.subscriptions();
    const live = normalizeBillingSubscriptions(snapshot.subscriptions).some((subscription) =>
      isLiveSubscription(subscription),
    );
    if (canOpenAgent({ hasLiveSubscription: live, isAdmin })) redirect("/agent");
  }
  return <HomePage signedIn={signedIn} />;
}

function LandingLoading(): React.JSX.Element {
  return <LandingSkeleton />;
}

export default function Page(): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<LandingLoading />}>
        <LandingData />
      </Suspense>
    </>
  );
}
