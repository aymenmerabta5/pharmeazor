import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@repo/database";
import { plans, prices } from "@repo/billing";
import { seedBillingCatalog } from "@repo/billing/adapters/catalog";
import type { BillingProviderName } from "@repo/billing";
import {
  createBillingPlanCatalog,
  type BillingPlanRecord,
  type BillingPlanRepositoryPort,
  type BillingPriceRecord,
} from "./billing-price-catalog";

/**
 * Plan and price storage.
 *
 * `ensureDefaults` inserts the built-in plans and prices with
 * `onConflictDoNothing`, so it is safe to call on a read path: it seeds a
 * fresh database and leaves an operator-edited row untouched.
 */
/**
 * The promise of a completed seed.
 *
 * Seeding is idempotent, but it is still a write. It runs once per process
 * so a read never pays for it twice.
 */
let seeded: Promise<void> | null = null;

export const billingPlanRepository: BillingPlanRepositoryPort = {
  async ensureDefaults(input) {
    // Seeding is idempotent, but it is still a write. It runs once per
    // process so a read never pays for it twice.
    seeded ??= seedBillingCatalog(db, input).catch((error: unknown) => {
      seeded = null;
      throw error;
    });
    await seeded;
  },

  async findPlanById(planId: string): Promise<BillingPlanRecord | null> {
    const [row] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tier: row.tier,
      interval: row.interval,
      intervalCount: row.intervalCount,
    };
  },

  async findPrice(input: {
    planId: string;
    provider: BillingProviderName;
    currency: string;
  }): Promise<BillingPriceRecord | null> {
    const [row] = await db
      .select()
      .from(prices)
      .where(
        and(
          eq(prices.planId, input.planId),
          eq(prices.provider, input.provider),
          eq(prices.currency, input.currency),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      planId: row.planId,
      provider: row.provider,
      amountMinor: row.amount,
      currency: row.currency,
      providerPriceId: row.providerPriceId,
    };
  },

  async listPlans(): Promise<BillingPlanRecord[]> {
    const rows = await db.select().from(plans).orderBy(asc(plans.tier));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tier: row.tier,
      interval: row.interval,
      intervalCount: row.intervalCount,
    }));
  },

  async listPrices(planId: string): Promise<BillingPriceRecord[]> {
    const rows = await db.select().from(prices).where(eq(prices.planId, planId));
    return rows.map((row) => ({
      planId: row.planId,
      provider: row.provider,
      amountMinor: row.amount,
      currency: row.currency,
      providerPriceId: row.providerPriceId,
    }));
  },

  async findPlanIdByProviderPrice(input: {
    provider: BillingProviderName;
    providerPriceId: string;
  }): Promise<string | null> {
    const [row] = await db
      .select({ planId: prices.planId })
      .from(prices)
      .where(
        and(eq(prices.provider, input.provider), eq(prices.providerPriceId, input.providerPriceId)),
      )
      .limit(1);
    return row?.planId ?? null;
  },

  async storeProviderPriceId(input: {
    planId: string;
    provider: BillingProviderName;
    currency: string;
    providerPriceId: string;
  }): Promise<void> {
    await db
      .update(prices)
      .set({ providerPriceId: input.providerPriceId, updatedAt: new Date() })
      .where(
        and(
          eq(prices.planId, input.planId),
          eq(prices.provider, input.provider),
          eq(prices.currency, input.currency),
        ),
      );
  },
};

const readEnvironment = (name: string): string | undefined => process.env[name];

/**
 * The plan and price catalog.
 *
 * It reads the `plans` and `prices` tables and seeds the built-in rows on
 * first use, so a fresh database works without a separate migration step.
 */
export const billingPlanCatalog = createBillingPlanCatalog({
  repository: billingPlanRepository,
  readEnvironment,
});
