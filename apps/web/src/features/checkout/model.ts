import {
  billingTierOf,
  planPrice,
  type BillingInterval,
  type BillingPlan,
  type BillingTier,
  type CheckoutRail,
} from "@/lib/billing-catalog";

/** A card rail the checkout can start, with the amount it charges. */
export interface CheckoutRailOption {
  rail: CheckoutRail;
  amountMinor: number;
  currency: string;
}

/**
 * What the wallet can do for this order.
 *
 * The wallet settles in DZD, so its price is the plan's manual price. A
 * customer who does not hold enough sees the exact amount to transfer instead
 * of a disabled button.
 */
export interface CheckoutBalanceOption {
  balanceMinor: number;
  priceMinor: number;
  currency: "DZD";
  canPay: boolean;
  shortfallMinor: number;
}

/** Everything the checkout page needs to render one plan. */
export interface CheckoutOrder {
  planId: string;
  tier: BillingTier | null;
  interval: BillingInterval;
  /** The hosted-checkout rails that are provisioned for this plan. */
  rails: CheckoutRailOption[];
  /** Null when the catalog has no DZD price for the plan. */
  balance: CheckoutBalanceOption | null;
}

/** The plan a customer is checking out, or null when the link names none. */
export function checkoutOrder(plan: BillingPlan, balanceMinor: number): CheckoutOrder {
  const manual = planPrice(plan, "manual");
  const priceMinor = manual?.currency === "DZD" ? manual.amountMinor : null;
  return {
    planId: plan.id,
    tier: billingTierOf(plan.id),
    interval: plan.interval === "year" ? "year" : "month",
    rails: (["stripe", "chargily"] as const).flatMap((rail) => {
      const price = planPrice(plan, rail);
      return price?.configured
        ? [{ rail, amountMinor: price.amountMinor, currency: price.currency }]
        : [];
    }),
    balance:
      priceMinor === null
        ? null
        : {
            balanceMinor,
            priceMinor,
            currency: "DZD",
            canPay: balanceMinor >= priceMinor,
            shortfallMinor: Math.max(0, priceMinor - balanceMinor),
          },
  };
}

/** The pricing translation key that names a tier. */
export function tierNameKey(
  tier: BillingTier | null,
): "tierBasicName" | "tierStandardName" | "tierProName" {
  if (tier === "basic") return "tierBasicName";
  if (tier === "standard") return "tierStandardName";
  return "tierProName";
}
