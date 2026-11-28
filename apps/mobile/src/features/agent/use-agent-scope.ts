import { useAuth } from "@/hooks/use-auth";
import { getInitials } from "@/features/app-shell/model";
import { subscriptionView } from "@/features/billing/model";
import { useBillingSnapshotQuery } from "@/features/billing/queries";
import { findLiveSubscription } from "@/lib/billing-liveness";
import { planDisplayName, resolveAgentEntitlement } from "./model";
import { useAgentOwnership } from "./queries";

/**
 * Who is asking, and whether their account may use the assistant.
 *
 * The billing snapshot is the same cached read the wallet uses, so opening the
 * assistant does not start a second subscription request. The key stays the
 * auth generation: a different account gets a different conversation. An
 * administrator is sponsored by the platform and is not gated by billing.
 */
export function useAgentScope() {
  const owner = useAgentOwnership();
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin" || auth.user?.role === "superAdmin";
  const snapshot = useBillingSnapshotQuery(owner.isAuthenticated && !isAdmin);
  const subscriptions =
    snapshot.data?.subscriptions.flatMap((value) => subscriptionView(value) ?? []) ?? [];
  const live = findLiveSubscription(subscriptions);
  const entitlement = resolveAgentEntitlement({
    isAdmin,
    livePlanId: live?.planId ?? null,
  });
  return {
    key: owner.generation,
    phase: owner.isPending
      ? ("pending" as const)
      : owner.isAuthenticated
        ? ("authenticated" as const)
        : ("anonymous" as const),
    subscribed: entitlement.subscribed,
    entitlementPending: owner.isAuthenticated && !isAdmin && snapshot.isPending,
    entitlementError: owner.isAuthenticated && !isAdmin && snapshot.isError,
    retryEntitlement: () => {
      void snapshot.refetch();
    },
    planName: planDisplayName(entitlement.planId),
    name: auth.user?.name ?? null,
    email: auth.user?.email ?? null,
    initials: getInitials(auth.user?.name, auth.user?.email),
  };
}
