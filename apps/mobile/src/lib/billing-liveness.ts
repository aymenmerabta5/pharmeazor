/**
 * Liveness for a billed subscription.
 *
 * The stored status is written when a payment lands and is not rewritten when
 * the paid period ends, so a live status whose period has run out no longer
 * grants the plan. The web catalog applies the same rule; the two clients must
 * agree on who may open the assistant.
 */

/** The statuses that grant a plan while the paid period is still running. */
const LIVE_STATUSES = new Set(["active", "trialing", "on_trial"]);

export interface SubscriptionPeriod {
  readonly status: string;
  readonly currentPeriodEnd?: string | null;
}

/** True while the subscription grants the plan it bought. */
export function isLiveSubscription(subscription: SubscriptionPeriod, now = Date.now()): boolean {
  if (!LIVE_STATUSES.has(subscription.status)) return false;
  const end = subscription.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : NaN;
  return Number.isFinite(end) && end > now;
}

/** The first subscription that still grants its plan, if there is one. */
export function findLiveSubscription<T extends SubscriptionPeriod>(
  subscriptions: readonly T[],
  now = Date.now(),
): T | null {
  return subscriptions.find((subscription) => isLiveSubscription(subscription, now)) ?? null;
}
