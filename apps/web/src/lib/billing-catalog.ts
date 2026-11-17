/**
 * The billing catalog as the browser renders it.
 *
 * The server sends plain JSON records from the plan and subscription tables, so
 * every value is checked here before a screen uses it. The rules are pure and
 * framework-free, which is what lets the pricing, checkout, and account screens
 * agree on the same plan and the same period.
 */

/** The rails this application can charge. Manual settles by transfer. */
export type BillingRail = "stripe" | "chargily" | "manual";

/** The rails that start a hosted checkout. Manual has no hosted page. */
export type CheckoutRail = Exclude<BillingRail, "manual">;

/** The tier a plan belongs to, independent of the period it is sold for. */
export const BILLING_TIERS = ["basic", "standard", "pro"] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export type BillingInterval = "month" | "year";

export interface BillingPlanPrice {
  provider: BillingRail;
  /** Price in the minor units of `currency`. */
  amountMinor: number;
  currency: string;
  /** True when the rail has the key and the provider price it needs. */
  configured: boolean;
}

export interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  tier: number;
  interval: string | null;
  intervalCount: number;
  prices: BillingPlanPrice[];
}

/** One tier on the page, with the plan row for each period it is sold for. */
export interface BillingTierOffering {
  tier: BillingTier;
  monthly: BillingPlan | null;
  yearly: BillingPlan | null;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused"
  | string;

export interface BillingSubscription {
  id: string;
  provider: BillingRail;
  providerSubscriptionId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function railName(value: unknown): BillingRail | null {
  return value === "stripe" || value === "chargily" || value === "manual" ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toBillingPrice(value: unknown): BillingPlanPrice | null {
  if (!isRecord(value)) return null;
  const provider = railName(value.provider);
  if (
    !provider ||
    typeof value.amountMinor !== "number" ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor < 0 ||
    typeof value.currency !== "string" ||
    value.currency.length !== 3
  )
    return null;
  return {
    provider,
    amountMinor: value.amountMinor,
    currency: value.currency.toUpperCase(),
    configured: value.configured === true,
  };
}

function toBillingPlan(value: unknown): BillingPlan | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : null;
  if (!id || typeof value.name !== "string" || value.name.length === 0) return null;
  const prices = Array.isArray(value.prices)
    ? value.prices.flatMap((entry) => {
        const price = toBillingPrice(entry);
        return price ? [price] : [];
      })
    : [];
  return {
    id,
    name: value.name,
    description: stringOrNull(value.description),
    tier: typeof value.tier === "number" && Number.isSafeInteger(value.tier) ? value.tier : 0,
    interval: stringOrNull(value.interval),
    intervalCount:
      typeof value.intervalCount === "number" && Number.isSafeInteger(value.intervalCount)
        ? Math.max(1, value.intervalCount)
        : 1,
    prices,
  };
}

/** Read the sellable catalog, dropping rows a screen cannot render. */
export function normalizeBillingPlans(value: unknown): BillingPlan[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      const plan = toBillingPlan(entry);
      return plan ? [plan] : [];
    })
    .sort((left, right) => left.tier - right.tier || left.id.localeCompare(right.id));
}

/**
 * The tier a plan belongs to.
 *
 * The catalog sells each tier twice, once monthly and once yearly, and the
 * yearly row carries a `-yearly` suffix. A plan an operator added under another
 * id is not a tier this page knows, so it is left out rather than guessed at.
 */
export function billingTierOf(planId: string): BillingTier | null {
  const tier = planId.endsWith("-yearly") ? planId.slice(0, -"-yearly".length) : planId;
  return (BILLING_TIERS as readonly string[]).includes(tier) ? (tier as BillingTier) : null;
}

/** True when the plan is the yearly row of its tier. */
export function isYearlyPlan(plan: Pick<BillingPlan, "interval">): boolean {
  return plan.interval === "year";
}

/**
 * Group the catalog into the three tiers the page sells.
 *
 * The period comes from the plan row, not from its id, so the grouping still
 * works if an operator edits the catalog and keeps the ids.
 */
export function billingTierOfferings(plans: readonly BillingPlan[]): BillingTierOffering[] {
  const byTier = new Map<BillingTier, BillingTierOffering>();
  for (const tier of BILLING_TIERS) byTier.set(tier, { tier, monthly: null, yearly: null });
  for (const plan of plans) {
    const tier = billingTierOf(plan.id);
    if (!tier) continue;
    const offering = byTier.get(tier);
    if (!offering) continue;
    if (plan.interval === "year") offering.yearly ??= plan;
    else if (plan.interval === "month") offering.monthly ??= plan;
  }
  return BILLING_TIERS.flatMap((tier) => {
    const offering = byTier.get(tier);
    return offering ? [offering] : [];
  });
}

/** The category of prices a card shows: the local rail when it exists. */
export function planPrice(plan: BillingPlan, provider: BillingRail): BillingPlanPrice | null {
  return plan.prices.find((price) => price.provider === provider) ?? null;
}

/**
 * The price shown before a rail is chosen.
 *
 * Algerian customers pay in DZD, so the manual price is the reference amount.
 * The card rails quote their own price beside it when they differ.
 */
export function headlinePrice(plan: BillingPlan): BillingPlanPrice | null {
  return planPrice(plan, "manual") ?? plan.prices[0] ?? null;
}

function toBillingSubscription(value: unknown): BillingSubscription | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : null;
  const provider = railName(value.provider);
  if (
    !id ||
    !provider ||
    typeof value.providerSubscriptionId !== "string" ||
    typeof value.status !== "string"
  )
    return null;
  return {
    id,
    provider,
    providerSubscriptionId: value.providerSubscriptionId,
    planId: typeof value.planId === "string" ? value.planId : "",
    status: value.status,
    currentPeriodStart: stringOrNull(value.currentPeriodStart),
    currentPeriodEnd: stringOrNull(value.currentPeriodEnd),
    autoRenew: value.autoRenew === true,
    cancelAtPeriodEnd: value.cancelAtPeriodEnd === true,
    customerId: stringOrNull(value.customerId),
  };
}

export function normalizeBillingSubscriptions(value: unknown): BillingSubscription[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const subscription = toBillingSubscription(entry);
    return subscription ? [subscription] : [];
  });
}

/**
 * The status a subscription shows today.
 *
 * The stored status is written when a payment lands and is not rewritten when
 * the period ends, so a live status whose period has run out is expired.
 */
export function subscriptionStatus(
  subscription: BillingSubscription,
  now = Date.now(),
): SubscriptionStatus {
  const { status } = subscription;
  if (status !== "active" && status !== "trialing" && status !== "on_trial") return status;
  const end = subscription.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : NaN;
  return Number.isFinite(end) && end > now ? status : "expired";
}

/** True while the subscription grants the plan it bought. */
export function isLiveSubscription(subscription: BillingSubscription, now = Date.now()): boolean {
  const status = subscriptionStatus(subscription, now);
  return status === "active" || status === "trialing" || status === "on_trial";
}
