import type { PlanView, SubscriptionView } from "@/features/billing/model";

export function selectPrimarySubscription(
  subscriptions: readonly SubscriptionView[],
): SubscriptionView | null {
  return (
    subscriptions.find((subscription) => subscription.status === "active") ??
    subscriptions.find((subscription) => subscription.status === "trialing") ??
    subscriptions.find((subscription) => subscription.status === "past_due") ??
    subscriptions[0] ??
    null
  );
}

export function selectPlan(
  subscription: SubscriptionView | null,
  plans: readonly PlanView[],
): PlanView | null {
  if (!subscription) return null;
  return plans.find((plan) => plan.id === subscription.planId) ?? null;
}

export function formatWalletAmount(minor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(minor / 100);
}

export function formatWalletDate(value: string | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}
