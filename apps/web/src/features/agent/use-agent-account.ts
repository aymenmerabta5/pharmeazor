"use client";
import { useAuth } from "@/hooks/use-auth";
import { useBilling } from "@/hooks/use-billing";
import {
  accountInitials,
  isAdminAccount,
  isLiveAgentSubscription,
  planDisplayName,
  planTierOf,
} from "./model";

/** Account chrome for the agent rail and plan badge. */
export function useAgentAccount() {
  const auth = useAuth();
  const billing = useBilling();
  const live = billing.subscriptions.find((subscription) => isLiveAgentSubscription(subscription));
  // The admission layer sponsors administrators, so their badge reflects the
  // entitlement that actually opened the surface rather than "free".
  const isAdmin = isAdminAccount(auth.user?.role);
  const planId = live?.planId ?? (isAdmin ? "sponsored" : null);
  const email = auth.user?.email ?? null;
  return {
    initials: accountInitials(auth.user),
    name: auth.user?.name ?? null,
    email,
    planId,
    planName: planDisplayName(planId),
    planTier: planTierOf(planId),
    planPending: auth.isPending || billing.isLoading,
    signedIn: Boolean(auth.user),
  };
}
