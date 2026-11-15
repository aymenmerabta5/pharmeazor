"use client";
import { useAuth } from "@/hooks/use-auth";
import { useBilling } from "@/hooks/use-billing";
import { accountInitials, planDisplayName } from "./model";

/** Account chrome for the agent rail and plan badge. */
export function useAgentAccount() {
  const auth = useAuth();
  const billing = useBilling();
  const active = billing.subscriptions.find(
    (subscription) =>
      subscription.status === "active" ||
      subscription.status === "trialing" ||
      subscription.status === "on_trial",
  );
  const planId = active?.planId ?? null;
  return {
    initials: accountInitials(auth.user),
    planName: planDisplayName(planId),
    planPending: auth.isPending || billing.isLoading,
  };
}
