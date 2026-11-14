import { and, gt, inArray, or } from "drizzle-orm";
import { subscriptions } from "@repo/billing";

/**
 * The plans that grant the assistant.
 *
 * The catalog sells three tiers, but only the top tier carries the agent.
 * This is the one place that decides it, so a tier change is a single edit.
 */
export const AGENT_ENTITLED_PLAN_IDS = ["pro"] as const;

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
