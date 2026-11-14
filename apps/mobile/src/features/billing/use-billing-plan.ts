"use client";
import * as React from "react";
import type { CheckoutProviderName, PlanView } from "./model";

/**
 * The plan the customer is about to pay for.
 *
 * One selection is shared by every rail, because the plan is the thing the
 * customer chooses. The price of that plan differs per rail.
 */
export function useBillingPlanSelection(plans: PlanView[]) {
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  function planIdFor(provider: CheckoutProviderName): string {
    // The customer chooses the plan. There is no silent default, because the
    // cheapest tier would otherwise be selected before anyone decides.
    const selected = plans.find((plan) => plan.id === selectedPlanId);
    if (!selected) return "";
    return selected.prices.some((price) => price.provider === provider) ? selected.id : "";
  }
  return { selectedPlanId, selectPlan: setSelectedPlanId, planIdFor };
}
