import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAgentConversation, listAgentConversations } from "@repo/api/harness";
import { isAdminRole } from "@repo/auth/roles";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { AgentPage } from "@/features/agent/page";
import { AgentSkeleton } from "@/features/agent/components/agent-skeleton";
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
 *
 * The saved conversation list and the durable session cursor also load here,
 * so a refresh restores the transcript the user was reading instead of
 * starting an empty chat.
 */
async function AgentData({
  question,
  conversationId,
}: {
  question?: string;
  conversationId?: string;
}): Promise<React.JSX.Element> {
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

  const owner = {
    organizationId: application.principal.activeOrganizationId,
    teamId: application.principal.activeTeamId,
    userId: me.user.id,
  };
  const [conversations, active] = await Promise.all([
    listAgentConversations(owner),
    conversationId ? getAgentConversation(owner, conversationId) : Promise.resolve(null),
  ]);
  if (conversationId && !active) redirect("/agent");

  return (
    <AgentPage
      key={active?.id ?? "new"}
      initialQuestion={question}
      initialConversations={conversations}
      initialSession={active ? { sessionId: active.id, streamIndex: 0 } : null}
    />
  );
}

function AgentLoading(): React.JSX.Element {
  return <AgentSkeleton />;
}

export default async function AgentRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const question = typeof params.q === "string" ? params.q : undefined;
  const conversationId = typeof params.c === "string" ? params.c : undefined;
  return (
    <Suspense fallback={<AgentLoading />}>
      <AgentData question={question} conversationId={conversationId} />
    </Suspense>
  );
}
