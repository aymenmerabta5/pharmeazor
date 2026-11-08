import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@repo/database";
import { customers } from "@repo/billing";
import type { BillingCustomerLookupPort } from "./create-checkout.service";

export const billingCustomerRepository: BillingCustomerLookupPort = {
  async findProviderCustomerId({ actorId, provider }) {
    const [customer] = await db
      .select({ providerCustomerId: customers.providerCustomerId })
      .from(customers)
      .where(and(eq(customers.userId, actorId), eq(customers.provider, provider)))
      .limit(1);
    return customer?.providerCustomerId ?? null;
  },
  async saveProviderCustomer({ actorId, provider, providerCustomerId, email }) {
    const [created] = await db
      .insert(customers)
      .values({ userId: actorId, provider, providerCustomerId, email })
      .onConflictDoNothing({ target: [customers.userId, customers.provider] })
      .returning({ providerCustomerId: customers.providerCustomerId });
    if (created?.providerCustomerId) return created.providerCustomerId;
    const existing = await db.query.customers.findFirst({
      where: and(eq(customers.userId, actorId), eq(customers.provider, provider)),
    });
    if (!existing) throw new Error("Billing customer mapping belongs to another actor");
    if (email && existing.email !== email) {
      await db
        .update(customers)
        .set({ email, updatedAt: new Date() })
        .where(eq(customers.id, existing.id));
    }
    return existing.providerCustomerId;
  },
};
