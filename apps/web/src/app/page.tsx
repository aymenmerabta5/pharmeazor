import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { HomePage } from "@/features/home/page";
import { isLiveSubscription, normalizeBillingSubscriptions } from "@/lib/billing-catalog";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

/**
 * The public landing page.
 *
 * A subscriber who reaches `/` is already inside the product, so the server
 * sends them to the agent instead of showing the sales page again. The
 * subscription read only happens when a verified session exists.
 */
async function LandingData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const signedIn = Boolean(me.user);
  if (me.user && application.principal?.emailVerified) {
    const snapshot = await application.billing.subscriptions();
    const live = normalizeBillingSubscriptions(snapshot.subscriptions).some((subscription) =>
      isLiveSubscription(subscription),
    );
    if (live) redirect("/agent");
  }
  return <HomePage signedIn={signedIn} />;
}

function LandingLoading(): React.JSX.Element {
  return (
    <div className="ph-surface" aria-busy="true">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-5 py-16">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-16 w-full max-w-2xl animate-pulse rounded bg-muted" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-muted" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl bg-muted" />
          <div className="h-80 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  );
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
