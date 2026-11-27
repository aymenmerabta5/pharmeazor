"use client";
import { useAuth } from "@/hooks/use-auth";
import { useBilling } from "@/hooks/use-billing";
import { accountInitials, isLiveAgentSubscription, planDisplayName, planTierOf } from "./model";

/** Account chrome for the agent rail and plan badge. */
export function useAgentAccount() {
  const auth = useAuth();
  const billing = useBilling();
  const live = billing.subscriptions.find((subscription) => isLiveAgentSubscription(subscription));
  const planId = live?.planId ?? null;
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
