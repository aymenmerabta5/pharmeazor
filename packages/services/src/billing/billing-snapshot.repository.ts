import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@repo/database";
import { subscriptions, invoices, usage_events, license_keys } from "@repo/billing";
import type { BillingSnapshotRepositoryPort } from "./list-subscriptions.service";
export const billingSnapshotRepository: BillingSnapshotRepositoryPort = {
  async findSnapshot(userId: string) {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
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
    return {
      subscriptions: subs,
      invoices: invs,
      usageEvents: usage,
      licenseKeys: keys,
    };
  },
};
