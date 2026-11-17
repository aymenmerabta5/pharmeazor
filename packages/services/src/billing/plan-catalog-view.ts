import "server-only";
import type { BillingPlanCatalogPort, BillingPriceRecord } from "./billing-price-catalog";
import { providerPriceEnvironmentName } from "./billing-price-catalog";

/**
 * A plan as the pricing and checkout surfaces read it.
 *
 * The provider price id is deliberately absent: it is a server-side routing
 * detail, and the checkout resolves it again from the catalog before a payment
 * starts. What the client does need is whether the rail can actually charge,
 * so a customer is never invited to pay on a rail that has no key yet.
 */
export interface PublicPlanPrice {
  readonly provider: "stripe" | "chargily" | "manual";
  /** Price in the minor units of `currency`. */
  readonly amountMinor: number;
  readonly currency: string;
  /** True when this rail can start a checkout for this plan today. */
  readonly configured: boolean;
}

export interface PublicPlan {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly tier: number;
  readonly interval: string;
  readonly intervalCount: number;
  readonly prices: readonly PublicPlanPrice[];
}

/** A configured value, not the placeholder the environment ships with. */
function isConfigured(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length > 0 && !value.startsWith("REPLACE_WITH");
}

/**
 * Whether a rail can charge this price.
 *
 * Both halves have to exist: a key for the provider and a price id on the
 * provider. The price id comes from the database once an operator provisions
 * it, otherwise from the environment. The manual rail needs neither, because
 * it settles by transfer and charges the catalog amount directly.
 */
function railIsConfigured(price: BillingPriceRecord): boolean {
  if (price.provider === "manual") return true;
  const apiKey =
    price.provider === "stripe" ? process.env.STRIPE_SECRET_KEY : process.env.CHARGILY_API_KEY;
  if (!isConfigured(apiKey)) return false;
  if (isConfigured(price.providerPriceId)) return true;
  const fromEnvironment = process.env[providerPriceEnvironmentName(price.provider, price.planId)];
  return isConfigured(fromEnvironment);
}

/**
 * Read the sellable catalog.
 *
 * Both the public pricing page and the signed-in billing snapshot use this
 * mapping, so a price shown before login and a price shown at checkout cannot
 * come from two different shapes.
 */
export async function toPublicPlans(
  catalog: Pick<BillingPlanCatalogPort, "listPlans" | "listPrices">,
): Promise<PublicPlan[]> {
  const plans = await catalog.listPlans();
  return await Promise.all(
    plans.map(async (plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      tier: plan.tier,
      interval: plan.interval,
      intervalCount: plan.intervalCount,
      prices: (await catalog.listPrices(plan.id)).map((price) => ({
        provider: price.provider,
        amountMinor: price.amountMinor,
        currency: price.currency,
        configured: railIsConfigured(price),
      })),
    })),
  );
}
