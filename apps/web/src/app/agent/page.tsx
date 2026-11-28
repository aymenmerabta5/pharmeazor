import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isAdminRole } from "@repo/auth/roles";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { AgentPage } from "@/features/agent/page";
import { canOpenAgent } from "@/lib/agent-access";
import { isLiveSubscription, normalizeBillingSubscriptions } from "@/lib/billing-catalog";

/**
 * The assistant surface.
 *
 * Access is decided on the server: a visitor without a session signs in, a
 * signed-in visitor without a live subscription chooses a plan, and only then
 * does the Eve-backed workspace mount. An administrator is exempt from the
 * subscription requirement because the admission layer sponsors that role.
 * The proxy still rejects a missing cookie before this page runs; this guard
 * covers the subscription.
 */
async function AgentData({ question }: { question?: string }): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  if (!me.user) redirect("/auth/sign-in");
  if (!application.principal?.emailVerified) redirect("/auth/verify-email");

  const isAdmin = isAdminRole(application.principal.role);
  const snapshot = await application.billing.subscriptions();
  const live = normalizeBillingSubscriptions(snapshot.subscriptions).some((subscription) =>
    isLiveSubscription(subscription),
  );
  if (!canOpenAgent({ hasLiveSubscription: live, isAdmin })) redirect("/pricing");

  return <AgentPage initialQuestion={question} />;
}

function AgentLoading(): React.JSX.Element {
  return (
    <div className="agent-shell flex h-dvh items-center justify-center bg-background">
      <div className="size-10 animate-pulse rounded-xl bg-muted" aria-hidden />
    </div>
  );
}

export default async function AgentRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const question = typeof params.q === "string" ? params.q : undefined;
  return (
    <Suspense fallback={<AgentLoading />}>
      <AgentData question={question} />
    </Suspense>
  );
}
