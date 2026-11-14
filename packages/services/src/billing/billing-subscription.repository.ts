import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@repo/database";
import { subscriptions } from "@repo/billing";
import type { BillingProviderName, SubscriptionStatus } from "@repo/billing";
import type {
  BillingExecutor,
  SubscriptionClaim,
  SubscriptionRepositoryPort,
  SubscriptionWrite,
} from "./subscription-lifecycle.service";

/**
 * Subscription storage.
 *
 * There is exactly one row per (user, plan). The `provider_state_version`
 * column is a fencing token: a handler claims a version before it reads
 * provider state and commits only while its version is still the newest one.
 * A handler that lost the race gets `null` back and must retry rather than
 * overwrite a newer state.
 */
export const billingSubscriptionRepository: SubscriptionRepositoryPort = {
  async claim(
    input: { userId: string; planId: string },
    options?: { executor?: BillingExecutor },
  ): Promise<SubscriptionClaim | null> {
    const executor = options?.executor ?? db;
    const [row] = await executor
      .update(subscriptions)
      .set({ providerStateVersion: sql`${subscriptions.providerStateVersion} + 1` })
      .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.planId, input.planId)))
      .returning({
        version: subscriptions.providerStateVersion,
        provider: subscriptions.provider,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        periodStart: subscriptions.currentPeriodStart,
        periodEnd: subscriptions.currentPeriodEnd,
        autoRenew: subscriptions.autoRenew,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        status: subscriptions.status,
        trialEnd: subscriptions.trialEnd,
        priceId: subscriptions.priceId,
        productId: subscriptions.productId,
        customerId: subscriptions.customerId,
        metadata: subscriptions.metadata,
        providerEventAt: subscriptions.providerEventAt,
      });
    if (!row) return null;
    return {
      version: row.version,
      provider: row.provider,
      providerSubscriptionId: row.providerSubscriptionId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      autoRenew: row.autoRenew,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      status: row.status,
      trialEnd: row.trialEnd,
      priceId: row.priceId,
      productId: row.productId,
      customerId: row.customerId,
      metadata: row.metadata,
      providerEventAt: row.providerEventAt,
    };
  },

  async apply(
    input: SubscriptionWrite & { expectedVersion: number | null },
    options?: { executor?: BillingExecutor },
  ): Promise<SubscriptionWrite | null> {
    const executor = options?.executor ?? db;
    const values = {
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      status: input.status,
      currentPeriodStart: input.periodStart,
      currentPeriodEnd: input.periodEnd,
      autoRenew: input.autoRenew,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      trialEnd: input.trialEnd ?? null,
      priceId: input.priceId ?? null,
      productId: input.productId ?? null,
      customerId: input.customerId ?? null,
      metadata: input.metadata ?? null,
      providerEventAt: input.providerEventAt ?? null,
    };
    const written: SubscriptionWrite = {
      userId: input.userId,
      planId: input.planId,
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      status: input.status,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      autoRenew: input.autoRenew,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      trialEnd: input.trialEnd ?? null,
      priceId: input.priceId ?? null,
      productId: input.productId ?? null,
      customerId: input.customerId ?? null,
      metadata: input.metadata ?? null,
      providerEventAt: input.providerEventAt ?? null,
    };

    if (input.expectedVersion === null) {
      // No row existed when this handler claimed. Take over a row that nobody
      // has modified yet; a row that already carries a claimed version means
      // another handler is ahead of us. A row that only carries the column
      // default is one this repository has not written, so it is safe to take.
      const [row] = await executor
        .insert(subscriptions)
        .values({
          userId: input.userId,
          planId: input.planId,
          ...values,
          providerStateVersion: 1,
        })
        .onConflictDoUpdate({
          target: [subscriptions.userId, subscriptions.planId],
          set: { ...values, providerStateVersion: 1, updatedAt: new Date() },
          setWhere: eq(subscriptions.providerStateVersion, 0),
        })
        .returning({ id: subscriptions.id });
      return row ? written : null;
    }

    const [row] = await executor
      .update(subscriptions)
      .set({ ...values, providerStateVersion: input.expectedVersion, updatedAt: new Date() })
      .where(
        and(
          eq(subscriptions.userId, input.userId),
          eq(subscriptions.planId, input.planId),
          eq(subscriptions.providerStateVersion, input.expectedVersion),
        ),
      )
      .returning({ id: subscriptions.id });
    return row ? written : null;
  },

  async findByProviderReference(
    input: { provider: BillingProviderName; providerSubscriptionId: string },
    options?: { executor?: BillingExecutor },
  ): Promise<
    (SubscriptionClaim & { userId: string; planId: string; status: SubscriptionStatus }) | null
  > {
    const executor = options?.executor ?? db;
    const [row] = await executor
      .select({
        version: subscriptions.providerStateVersion,
        provider: subscriptions.provider,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        periodStart: subscriptions.currentPeriodStart,
        periodEnd: subscriptions.currentPeriodEnd,
        autoRenew: subscriptions.autoRenew,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        status: subscriptions.status,
        trialEnd: subscriptions.trialEnd,
        priceId: subscriptions.priceId,
        productId: subscriptions.productId,
        customerId: subscriptions.customerId,
        metadata: subscriptions.metadata,
        providerEventAt: subscriptions.providerEventAt,
        userId: subscriptions.userId,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.provider, input.provider),
          eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      version: row.version,
      provider: row.provider,
      providerSubscriptionId: row.providerSubscriptionId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      autoRenew: row.autoRenew,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      status: row.status,
      trialEnd: row.trialEnd,
      priceId: row.priceId,
      productId: row.productId,
      customerId: row.customerId,
      metadata: row.metadata,
      providerEventAt: row.providerEventAt,
      userId: row.userId,
      planId: row.planId,
    };
  },
};

export type { SubscriptionStatus, BillingProviderName };
