import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@repo/database";
import { subscriptions, invoices, usage_events, license_keys } from "@repo/billing";
import { isBillingPeriodCovered } from "@repo/billing";
import type { BillingSnapshotRepositoryPort } from "./list-subscriptions.service";
import { billingPlanCatalog } from "./billing-plan.repository";

/**
 * The status a subscription shows.
 *
 * The status column is written when a payment lands and is not rewritten when
 * the period ends, so the period decides whether a subscription is live.
 */
function effectiveStatus(status: string, periodEnd: Date | null, now: Date): string {
  if (status !== "active" && status !== "trialing" && status !== "on_trial") return status;
  return isBillingPeriodCovered(periodEnd, now) ? status : "expired";
}

export const billingSnapshotRepository: BillingSnapshotRepositoryPort = {
  async findSnapshot(userId: string) {
    const now = new Date();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const subs = rows.map((row) => ({
      ...row,
      status: effectiveStatus(row.status, row.currentPeriodEnd, now),
    }));
    const subIds = subs.map((s: { id: string }) => s.id);
    const [invs, usage, keys] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.userId, userId)),
      subIds.length
        ? db.select().from(usage_events).where(inArray(usage_events.subscriptionId, subIds))
        : Promise.resolve([]),
      subIds.length
        ? db.select().from(license_keys).where(inArray(license_keys.subscriptionId, subIds))
        : Promise.resolve([]),
    ]);
    const planRecords = await billingPlanCatalog.listPlans();
    const plans = await Promise.all(
      planRecords.map(async (plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        tier: plan.tier,
        interval: plan.interval,
        intervalCount: plan.intervalCount,
        prices: (await billingPlanCatalog.listPrices(plan.id)).map((price) => ({
          provider: price.provider,
          amountMinor: price.amountMinor,
          currency: price.currency,
        })),
      })),
    );
    return {
      subscriptions: subs,
      invoices: invs,
      usageEvents: usage,
      licenseKeys: keys,
      plans,
    };
  },
};
