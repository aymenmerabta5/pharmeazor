/**
 * The account billing surface as pure data.
 *
 * The server sends plain rows, so every value is normalized before a card
 * renders it. The rules are framework-free, which is what lets the balance
 * hero, the plan card, and the checkout read the same subscription the same
 * way.
 */
import {
  isLiveSubscription,
  normalizeBillingPlans,
  normalizeBillingSubscriptions,
  subscriptionStatus,
  type BillingPlan,
  type BillingSubscription,
  type SubscriptionStatus,
} from "@/lib/billing-catalog";
import type { SurfaceMessageKey } from "@/lib/translations";

export interface AccountBillingSnapshot {
  subscriptions: BillingSubscription[];
  plans: BillingPlan[];
}

/** Read the server snapshot, dropping rows a card cannot render. */
export function accountBillingSnapshot(value: {
  subscriptions?: unknown;
  plans?: unknown;
}): AccountBillingSnapshot {
  return {
    subscriptions: normalizeBillingSubscriptions(value.subscriptions),
    plans: normalizeBillingPlans(value.plans),
  };
}

/**
 * The subscription the account is paying for right now.
 *
 * A lapsed row is not a plan the customer owns, so only a live period counts.
 * When two rows overlap the later expiry wins, which is the coverage the
 * customer actually holds.
 */
export function activeSubscription(
  subscriptions: readonly BillingSubscription[],
  now = Date.now(),
): BillingSubscription | null {
  return (
    subscriptions
      .filter((subscription) => isLiveSubscription(subscription, now))
      .sort(
        (left, right) =>
          (Date.parse(right.currentPeriodEnd ?? "") || 0) -
          (Date.parse(left.currentPeriodEnd ?? "") || 0),
      )[0] ?? null
  );
}

/** The catalog row a subscription bought. */
export function subscriptionPlan(
  subscription: BillingSubscription,
  plans: readonly BillingPlan[],
): BillingPlan | null {
  return plans.find((plan) => plan.id === subscription.planId) ?? null;
}

/** The badge a status shows, in the `billing` surface's words. */
export function subscriptionStatusKey(status: SubscriptionStatus): SurfaceMessageKey<"billing"> {
  switch (status) {
    case "active":
      return "subscriptionStatusActive";
    case "trialing":
      return "subscriptionStatusTrialing";
    case "on_trial":
      return "subscriptionStatusOnTrial";
    case "past_due":
      return "subscriptionStatusPastDue";
    case "canceled":
      return "subscriptionStatusCanceled";
    case "unpaid":
      return "subscriptionStatusUnpaid";
    case "incomplete":
      return "subscriptionStatusIncomplete";
    case "incomplete_expired":
      return "subscriptionStatusIncompleteExpired";
    case "paused":
      return "subscriptionStatusPaused";
    case "trial_ended":
      return "subscriptionStatusTrialEnded";
    case "expired":
      return "subscriptionStatusExpired";
    default:
      return "subscriptionStatusUnknown";
  }
}

/** The status that is true today, not the status stored when payment landed. */
export function liveStatus(
  subscription: BillingSubscription,
  now = Date.now(),
): SubscriptionStatus {
  return subscriptionStatus(subscription, now);
}

/** The badge label for a plan's billing period. */
export function subscriptionPeriodKey(plan: BillingPlan | null): "periodMonthly" | "periodYearly" {
  return plan?.interval === "year" ? "periodYearly" : "periodMonthly";
}

/** Only Stripe runs a customer portal; the other rails return to checkout. */
export function canOpenCustomerPortal(subscription: BillingSubscription): boolean {
  return subscription.provider === "stripe";
}

/** A date the customer can read, or null when the row carries no usable date. */
export function formatBillingDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** What the account billing screen renders for the plan the customer owns. */
export interface AccountPlanView {
  subscription: BillingSubscription;
  plan: BillingPlan | null;
  statusKey: SurfaceMessageKey<"billing">;
  periodKey: "periodMonthly" | "periodYearly";
  endsOn: string | null;
  canPortal: boolean;
  renews: boolean;
}

export function accountPlanView(
  snapshot: AccountBillingSnapshot,
  now = Date.now(),
): AccountPlanView | null {
  const subscription = activeSubscription(snapshot.subscriptions, now);
  if (!subscription) return null;
  const plan = subscriptionPlan(subscription, snapshot.plans);
  return {
    subscription,
    plan,
    statusKey: subscriptionStatusKey(subscriptionStatus(subscription, now)),
    periodKey: subscriptionPeriodKey(plan),
    endsOn: subscription.currentPeriodEnd,
    canPortal: canOpenCustomerPortal(subscription),
    renews: subscription.autoRenew && !subscription.cancelAtPeriodEnd,
  };
}
