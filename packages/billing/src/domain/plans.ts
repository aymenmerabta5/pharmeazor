/**
 * Subscription plans — the entitlement contract every payment rail agrees on.
 * A plan answers three questions that Stripe, Chargily and manual transfer
 * would otherwise answer three different ways:
 *   1. what did the customer buy          -> `id` / `name`
 *   2. how long does one payment buy       -> `interval` / `intervalCount`
 *   3. how much is it worth                -> the `prices` rows, not the plan
 *
 * The money lives in `prices`, keyed by (plan, provider), because the same
 * plan is sold in two markets: USD on the global Stripe rail and DZD on the
 * Algerian rails (Chargily and manual transfer). The plan is the thing all
 * three rails share.
 */

import type { BillingProviderName } from "./model";

export const BILLING_INTERVALS = ["day", "week", "month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_PLAN_IDS = ["basic", "standard", "pro"] as const;
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

/** The currency a rail settles in when the customer does not pick one. */
export const BILLING_PROVIDER_DEFAULT_CURRENCY = {
  stripe: "USD",
  chargily: "DZD",
  manual: "DZD",
} as const;

export type { BillingProviderName };

export interface BillingPlanDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  /** Ordering of the tiers, lowest first. */
  readonly tier: number;
  /** How much time a single payment buys. */
  readonly interval: BillingInterval;
  readonly intervalCount: number;
}

export interface BillingPriceDefinition {
  readonly planId: string;
  readonly provider: BillingProviderName;
  /** Price in the minor units of `currency`. */
  readonly amountMinor: number;
  readonly currency: string;
}

/**
 * The plans this application sells.
 *
 * The rows are seeded idempotently into the `plans` table on first read, so an
 * operator can then edit the stored row (a different price, a different
 * interval) without a deploy. The code below is only the bootstrap seed, never
 * the source of truth at read time.
 */
export const DEFAULT_BILLING_PLANS: readonly BillingPlanDefinition[] = [
  {
    id: "basic",
    name: "Basic",
    description: "The pharmacy assistant and the essential catalogue tools.",
    tier: 10,
    interval: "month",
    intervalCount: 1,
  },
  {
    id: "standard",
    name: "Standard",
    description: "Everything in Basic, plus the professional workflow tools.",
    tier: 20,
    interval: "month",
    intervalCount: 1,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Every capability, including the multi-pharmacy tooling.",
    tier: 30,
    interval: "month",
    intervalCount: 1,
  },
];

/**
 * The USD/DZD rate used to keep the two price ladders matched.
 *
 * This is the Binance P2P USDT rate for Algeria, which is the price an
 * Algerian customer actually faces when they hold USDT. It is the reference
 * the local market uses, not the Bank of Algeria official rate (~137), and it
 * is roughly 1.9x higher.
 *
 * Pricing the DZD ladder from this rate means an Algerian subscriber pays the
 * same real value as an international one, instead of the local market being
 * silently cheaper or dearer than the global one.
 *
 * The value is a dated snapshot, not a live feed. Change it here and re-seed
 * the prices to reprice; existing subscribers keep the price they bought.
 */
export const BILLING_USD_DZD_RATE = 259;

/** Round a DZD amount to the nearest 100 DZD so prices read cleanly. */
function roundDzd(dzdWhole: number): number {
  return Math.round(dzdWhole / 100) * 100;
}

/**
 * Derive the DZD price of a plan from its USD price.
 *
 * Both currencies use a minor unit of one hundredth, so the USD minor amount
 * is converted to whole USD, multiplied by the rate, and returned as DZD
 * minor units.
 */
export function deriveDzdAmountMinor(usdAmountMinor: number): number {
  if (!Number.isSafeInteger(usdAmountMinor) || usdAmountMinor < 1) {
    throw new Error(`BILLING_USD_AMOUNT_INVALID: ${String(usdAmountMinor)}`);
  }
  const dzdWhole = roundDzd((usdAmountMinor / 100) * BILLING_USD_DZD_RATE);
  if (dzdWhole < 1) throw new Error("BILLING_DZD_AMOUNT_INVALID: derived price rounded to zero");
  return dzdWhole * 100;
}

export interface BillingPlanPriceSeed {
  readonly planId: string;
  /** Price in USD minor units (cents). */
  readonly usdAmountMinor: number;
}

/**
 * What each plan costs in USD.
 *
 * Stripe is the global rail and settles in USD. Chargily and manual transfer
 * are Algerian rails and settle in DZD at the rate above.
 */
export const DEFAULT_BILLING_PLAN_PRICES: readonly BillingPlanPriceSeed[] = [
  { planId: "basic", usdAmountMinor: 800 },
  { planId: "standard", usdAmountMinor: 2_000 },
  { planId: "pro", usdAmountMinor: 10_000 },
];

/**
 * The price of every plan on every rail.
 *
 * Built from the USD ladder so the two currencies stay matched by
 * construction rather than by two hand-kept lists.
 */
export const DEFAULT_BILLING_PRICES: readonly BillingPriceDefinition[] =
  DEFAULT_BILLING_PLAN_PRICES.flatMap((seed) => [
    {
      planId: seed.planId,
      provider: "stripe" as const,
      amountMinor: seed.usdAmountMinor,
      currency: "USD",
    },
    {
      planId: seed.planId,
      provider: "chargily" as const,
      amountMinor: deriveDzdAmountMinor(seed.usdAmountMinor),
      currency: "DZD",
    },
    {
      planId: seed.planId,
      provider: "manual" as const,
      amountMinor: deriveDzdAmountMinor(seed.usdAmountMinor),
      currency: "DZD",
    },
  ]);

const MS_PER_DAY = 86_400_000;

/**
 * Add whole calendar units to a timestamp.
 *
 * Month and year arithmetic is calendar-based, not a fixed millisecond count:
 * a period that starts on the 31st must end on the last day of the target
 * month, not overflow into the following one. All arithmetic is in UTC so the
 * result does not depend on the server's timezone.
 */
export function addBillingInterval(from: Date, interval: BillingInterval, count = 1): Date {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`BILLING_INTERVAL_COUNT_INVALID: ${String(count)}`);
  }
  if (from.getTime() !== from.getTime()) {
    throw new Error("BILLING_INTERVAL_START_INVALID: start timestamp is not a valid date");
  }
  const result = new Date(from.getTime());
  switch (interval) {
    case "day":
      result.setUTCDate(result.getUTCDate() + count);
      return result;
    case "week":
      result.setUTCDate(result.getUTCDate() + 7 * count);
      return result;
    case "month":
      return addCalendarMonths(from, count);
    case "year":
      return addCalendarMonths(from, 12 * count);
  }
}

function addCalendarMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const dayOfMonth = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return result;
}

export interface BillingPeriod {
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

/**
 * Compute the period a payment buys.
 *
 * Paying early stacks onto the remaining coverage instead of truncating it:
 * the period keeps its original start and the end moves out by one interval.
 * Paying after the period lapsed starts a fresh window from `from`.
 */
export function extendBillingPeriod(
  plan: Pick<BillingPlanDefinition, "interval" | "intervalCount">,
  from: Date,
  current?: { periodStart?: Date | null; periodEnd?: Date | null } | null,
): BillingPeriod {
  const currentEnd = current?.periodEnd ?? null;
  const isStillCovered = currentEnd !== null && currentEnd.getTime() > from.getTime();
  const base = isStillCovered ? currentEnd : from;
  const currentStart = current?.periodStart ?? null;
  // The original start only survives while the coverage it belongs to is
  // still running. A lapsed period starts over at the payment.
  const periodStart = isStillCovered && currentStart !== null ? currentStart : from;
  return {
    periodStart,
    periodEnd: addBillingInterval(base, plan.interval, plan.intervalCount),
  };
}

/** True while the period still covers `now`. A lapsed period covers nothing. */
export function isBillingPeriodCovered(periodEnd: Date | null | undefined, now: Date): boolean {
  if (!periodEnd) return false;
  return periodEnd.getTime() > now.getTime();
}

/** Days left in the period, floored at zero. Used for renewal reminders. */
export function billingPeriodRemainingDays(periodEnd: Date | null | undefined, now: Date): number {
  if (!periodEnd) return 0;
  return Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / MS_PER_DAY));
}
