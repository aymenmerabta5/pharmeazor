/** Pricing surface model: a tier card derived from the billed catalog. */
import type { BillingTier } from "@/lib/billing-catalog";
import type { SurfaceMessageKey } from "@/lib/translations";

/** The period switch the pricing page shows. */
export type PricingInterval = "monthly" | "yearly";

/** The copy keys a tier card reads. */
export type PricingCopyKey = SurfaceMessageKey<"pricing">;

export const TIER_NAMES: Readonly<Record<BillingTier, PricingCopyKey>> = {
  basic: "tierBasicName",
  standard: "tierStandardName",
  pro: "tierProName",
};

export const TIER_DESCRIPTIONS: Readonly<Record<BillingTier, PricingCopyKey>> = {
  basic: "tierBasicDescription",
  standard: "tierStandardDescription",
  pro: "tierProDescription",
};

export const TIER_FEATURES: Readonly<Record<BillingTier, readonly PricingCopyKey[]>> = {
  basic: ["tierBasicFeature1", "tierBasicFeature2", "tierBasicFeature3", "tierBasicFeature4"],
  standard: [
    "tierStandardFeature1",
    "tierStandardFeature2",
    "tierStandardFeature3",
    "tierStandardFeature4",
  ],
  pro: ["tierProFeature1", "tierProFeature2", "tierProFeature3", "tierProFeature4"],
};

/**
 * One card as it is rendered.
 *
 * `planId` is null when the catalog sells no plan of this tier for the chosen
 * period; the card then says so instead of inventing a price.
 */
export interface PricingCard {
  tier: BillingTier;
  planId: string | null;
  name: string;
  description: string;
  /** The formatted price, empty when the tier has no plan for the period. */
  price: string;
  period: string;
  features: { key: string; label: string }[];
  cta: string;
  /** Null when the card cannot be acted on. */
  href: string | null;
  popular: boolean;
  current: boolean;
}
