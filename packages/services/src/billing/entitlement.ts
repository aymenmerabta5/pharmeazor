import { and, gt, inArray, or } from "drizzle-orm";
import { BILLING_PLAN_IDS, subscriptions } from "@repo/billing";

/**
 * The plans that grant the assistant.
 *
 * Every paid tier carries the agent; the tiers differ in the limits and tools
 * around it, not in whether the assistant exists. The list is derived from the
 * catalog so a new plan cannot be sold without granting what it sells.
 */
export const AGENT_ENTITLED_PLAN_IDS = BILLING_PLAN_IDS;

/**
 * Statuses that grant access while the period is still covered.
 *
 * A trialing subscription is covered by `trial_end` when the rail reported
 * one, and by the covered period otherwise.
 */
export const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing", "on_trial"] as const;

/**
 * The predicate that decides whether a user holds a live subscription.
 *
 * It is deliberately plan-aware: the tier decides what a subscription grants,
 * and a lapsed period grants nothing.
 */
export function buildEntitlementPredicate(planIds: readonly string[], now: Date) {
  return and(
    inArray(subscriptions.planId, [...planIds]),
    inArray(subscriptions.status, [...ENTITLED_SUBSCRIPTION_STATUSES]),
    or(
      // The covered period is the expiry.
      gt(subscriptions.currentPeriodEnd, now),
      // A trial is covered by the trial end, when the rail reported one.
      and(inArray(subscriptions.status, ["trialing", "on_trial"]), gt(subscriptions.trialEnd, now)),
    ),
  );
}
