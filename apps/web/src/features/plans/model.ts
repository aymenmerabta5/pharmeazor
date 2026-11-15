import type { SurfaceMessageKey } from "@/lib/translations";

export type BillingCycle = "monthly" | "yearly";

export interface PlanDefinition {
  readonly id: "free" | "pro" | "pharmacy";
  readonly nameKey: SurfaceMessageKey<"plans">;
  readonly audienceKey: SurfaceMessageKey<"plans">;
  readonly priceMonthly: number | null;
  readonly priceYearly: number | null;
  readonly featureKeys: readonly SurfaceMessageKey<"plans">[];
  readonly featured?: boolean;
}

export const PLAN_DEFINITIONS = [
  {
    id: "free",
    nameKey: "freeName",
    audienceKey: "freeAudience",
    priceMonthly: 0,
    priceYearly: 0,
    featureKeys: ["freeFeature1", "freeFeature2", "freeFeature3", "freeFeature4"],
  },
  {
    id: "pro",
    nameKey: "proName",
    audienceKey: "proAudience",
    priceMonthly: 1500,
    priceYearly: 15000,
    featured: true,
    featureKeys: ["proFeature1", "proFeature2", "proFeature3", "proFeature4", "proFeature5"],
  },
  {
    id: "pharmacy",
    nameKey: "pharmacyName",
    audienceKey: "pharmacyAudience",
    priceMonthly: null,
    priceYearly: null,
    featureKeys: ["pharmacyFeature1", "pharmacyFeature2", "pharmacyFeature3", "pharmacyFeature4"],
  },
] as const satisfies readonly PlanDefinition[];
