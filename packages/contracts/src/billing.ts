/**
 * The plans this application sells, as a contract both capabilities read.
 *
 * Billing owns the catalog and its prices; the assistant unlocks for any paid
 * tier. Both have to agree on the same identifiers, so the list lives here
 * rather than in either capability: a plan renamed in one place and not the
 * other would silently deny access the customer paid for.
 *
 * A plan is one tier bought for one period, so every tier appears twice, once
 * monthly and once yearly.
 */
export const BILLING_PLAN_IDS = [
  "basic",
  "basic-yearly",
  "standard",
  "standard-yearly",
  "pro",
  "pro-yearly",
] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];
