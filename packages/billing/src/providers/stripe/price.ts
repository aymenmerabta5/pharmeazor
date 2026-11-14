import type Stripe from "stripe";

/**
 * The price Stripe charges for a price id.
 *
 * The catalog holds the price this application advertises. This is what the
 * customer is actually charged, so the two are compared before a checkout
 * starts.
 */
export async function getStripePrice(
  stripe: Stripe,
  providerPriceId: string,
): Promise<{ amountMinor: number; currency: string } | null> {
  const price = await stripe.prices.retrieve(providerPriceId);
  if (price.unit_amount === null) return null;
  return { amountMinor: price.unit_amount, currency: price.currency.toUpperCase() };
}
