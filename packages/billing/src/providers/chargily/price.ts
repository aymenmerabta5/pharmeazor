/**
 * Chargily price.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client";

/**
 * The price Chargily charges for a price id.
 *
 * The catalog holds the price this application advertises. This is what the
 * customer is actually charged, so the two are compared before a checkout
 * starts.
 */
export async function getChargilyPrice(
  providerPriceId: string,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<{ amountMinor: number; currency: string } | null> {
  ensureServerOnly();
  const price = await getChargilyClient(config).getPrice(providerPriceId);
  if (!price || typeof price.amount !== "number") return null;
  return { amountMinor: price.amount, currency: price.currency.toUpperCase() };
}
