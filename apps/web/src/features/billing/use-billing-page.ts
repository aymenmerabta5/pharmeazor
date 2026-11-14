"use client";
import * as React from "react";
import { normalizeBillingSnapshot, type BillingInitialData } from "./model";
import { useBillingActions } from "./use-billing-actions";
export type {
  ProviderName,
  CheckoutProviderName,
  Sub,
  Inv,
  LicenseKey,
  UsageEvent,
  Plan,
  BillingInitialData,
} from "./model";

export function useBillingPage(initialData: BillingInitialData) {
  const data = normalizeBillingSnapshot(initialData);
  const actions = useBillingActions();
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const plans = data.plans;
  // The customer chooses the plan. There is no silent default, because the
  // cheapest tier would otherwise be selected before anyone decides.
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  return {
    ...data,
    ...actions,
    plans,
    selectedPlan,
    selectedPlanId: selectedPlan?.id ?? null,
    selectPlan: setSelectedPlanId,
    subsLoading: false,
    canCreatePaymentLinks: initialData.canCreatePaymentLinks === true,
    pastDue: data.subscriptions.some((subscription) => subscription.status === "past_due"),
  };
}
