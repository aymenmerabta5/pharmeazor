import type * as React from "react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { PricingPage } from "@/features/pricing/page";
import {
  isLiveSubscription,
  normalizeBillingPlans,
  normalizeBillingSubscriptions,
} from "@/lib/billing-catalog";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

/**
 * The catalog the page sells, plus whether the visitor already owns a tier.
 *
 * The catalog is public; the subscription read only happens when a session
 * exists, so a signed-out visitor never pays for an authenticated query.
 */
async function PricingData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const [me, catalog] = await Promise.all([application.me(), application.billing.plans()]);
  const plans = normalizeBillingPlans(catalog.plans);
  let currentPlanIds: string[] = [];
  if (me.user && application.principal?.emailVerified) {
    const snapshot = await application.billing.subscriptions();
    currentPlanIds = normalizeBillingSubscriptions(snapshot.subscriptions)
      .filter((subscription) => isLiveSubscription(subscription))
      .map((subscription) => subscription.planId);
  }
  return <PricingPage plans={plans} signedIn={Boolean(me.user)} currentPlanIds={currentPlanIds} />;
}

function PricingLoading(): React.JSX.Element {
  return (
    <div className="ph-surface" aria-busy="true">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-16">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-10 w-full max-w-md animate-pulse rounded bg-muted" />
        <div className="grid gap-5 pt-6 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-80 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PricingRoute(): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<PricingLoading />}>
        <PricingData />
      </Suspense>
    </>
  );
}
