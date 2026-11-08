import "server-only";
import type { BillingPriceCatalogPort, BillingProviderName } from "./create-checkout.service";

const PRO_PRICE_ENV: Record<BillingProviderName, string> = {
  stripe: "BILLING_STRIPE_PRO_PRICE_ID",
  chargily: "BILLING_CHARGILY_PRO_PRICE_ID",
  paddle: "BILLING_PADDLE_PRO_PRICE_ID",
  polar: "BILLING_POLAR_PRO_PRODUCT_ID",
};

export function createBillingPriceCatalog(
  readEnvironment: (name: string) => string | undefined,
): BillingPriceCatalogPort {
  return {
    async resolvePrice({ provider, planId }) {
      if (planId !== "pro") throw new Error("Unsupported billing plan");
      const envName = PRO_PRICE_ENV[provider];
      const value = readEnvironment(envName);
      if (!value || value.startsWith("REPLACE_WITH")) {
        throw new Error(`Billing plan pro is not configured for ${provider}`);
      }
      return value;
    },
  };
}
