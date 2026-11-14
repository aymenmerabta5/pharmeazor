import "server-only";
import { db } from "@repo/database";
import { plans, prices } from "../schema/billing";
import type { BillingPlanDefinition, BillingPriceDefinition } from "../domain/plans";

/**
 * A connection that can run the catalog statements.
 *
 * The database handle and a transaction both satisfy it, so the same seed
 * runs inside a caller's transaction when it has to.
 */
export type BillingCatalogExecutor = typeof db;

/**
 * Insert the built-in plans and prices if they are missing.
 *
 * `onConflictDoNothing` makes it idempotent and non-destructive: it seeds a
 * fresh database and leaves an operator-edited row exactly as it is.
 */
export async function seedBillingCatalog(
  executor: BillingCatalogExecutor,
  input: { plans: readonly BillingPlanDefinition[]; prices: readonly BillingPriceDefinition[] },
): Promise<void> {
  if (input.plans.length > 0) {
    await executor
      .insert(plans)
      .values(
        input.plans.map((definition) => ({
          id: definition.id,
          name: definition.name,
          description: definition.description ?? null,
          tier: definition.tier,
          interval: definition.interval,
          intervalCount: definition.intervalCount,
        })),
      )
      .onConflictDoNothing({ target: plans.id });
  }
  if (input.prices.length > 0) {
    await executor
      .insert(prices)
      .values(
        input.prices.map((definition) => ({
          planId: definition.planId,
          provider: definition.provider,
          amount: definition.amountMinor,
          currency: definition.currency,
          providerPriceId: null,
        })),
      )
      .onConflictDoNothing({ target: [prices.planId, prices.provider, prices.currency] });
  }
}
