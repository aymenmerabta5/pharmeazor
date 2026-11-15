"use client";
import { useState } from "react";
import { useBilling } from "@/hooks/use-billing";
import { PLAN_DEFINITIONS, type BillingCycle } from "./model";

export function usePlans() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const billing = useBilling();
  const active = billing.subscriptions.find(
    (subscription) =>
      subscription.status === "active" ||
      subscription.status === "trialing" ||
      subscription.status === "on_trial",
  );
  return {
    cycle,
    setCycle,
    plans: PLAN_DEFINITIONS,
    currentPlanId: active?.planId ?? "free",
  };
}
