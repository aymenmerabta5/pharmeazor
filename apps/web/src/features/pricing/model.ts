/** Pricing surface model: the billing interval and the plan card shape. */

export type BillingInterval = "monthly" | "yearly";

export const BILLING_INTERVALS: readonly BillingInterval[] = ["monthly", "yearly"];

export interface PlanFeature {
  key: string;
  label: string;
}

export interface Plan {
  id: "free" | "pro" | "pharmacy";
  name: string;
  description: string;
  price: string;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
}
