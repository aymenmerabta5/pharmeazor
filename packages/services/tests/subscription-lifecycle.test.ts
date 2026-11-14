import { describe, it, expect } from "bun:test";
import { billing } from "@repo/services";

type SubscriptionRepositoryPort = billing.SubscriptionRepositoryPort;
type SubscriptionWrite = billing.SubscriptionWrite;
type BillingPlanCatalogPort = billing.BillingPlanCatalogPort;

type StoredRow = SubscriptionWrite & { version: number };

function createRepository() {
  const rows = new Map<string, StoredRow>();
  const key = (userId: string, planId: string) => `${userId}:${planId}`;
  const repository: SubscriptionRepositoryPort = {
    async claim(input) {
      const row = rows.get(key(input.userId, input.planId));
      if (!row) return null;
      const version = row.version + 1;
      rows.set(key(input.userId, input.planId), { ...row, version });
      return {
        version,
        provider: row.provider,
        providerSubscriptionId: row.providerSubscriptionId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        autoRenew: row.autoRenew ?? false,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
        status: row.status,
        trialEnd: row.trialEnd ?? null,
        priceId: row.priceId ?? null,
        productId: row.productId ?? null,
        customerId: row.customerId ?? null,
        metadata: row.metadata ?? null,
        providerEventAt: row.providerEventAt ?? null,
      };
    },
    async apply(input) {
      const rowKey = key(input.userId, input.planId);
      const existing = rows.get(rowKey);
      if (input.expectedVersion === null) {
        if (existing) return null;
        rows.set(rowKey, { ...input, version: 1 });
        return input;
      }
      if (!existing || existing.version !== input.expectedVersion) return null;
      rows.set(rowKey, { ...existing, ...input, version: input.expectedVersion });
      return input;
    },
    async findByProviderReference() {
      return null;
    },
  };
  return { repository, rows };
}

const planCatalog: BillingPlanCatalogPort = {
  async resolvePlan(planId) {
    if (planId !== "pro") throw new Error(`unknown plan ${planId}`);
    return {
      id: "pro",
      name: "Pro",
      description: null,
      tier: 30,
      interval: "month",
      intervalCount: 1,
    };
  },
  async listPlans() {
    return [];
  },
  async listPrices() {
    return [];
  },
  async resolvePlanIdByProviderPrice() {
    return null;
  },
};

describe("subscription lifecycle", () => {
  it("grants the period a payment bought", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    const outcome = await lifecycle.grantPaidPeriod({
      userId: "user-1",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    expect(outcome.outcome).toBe("applied");
    const row = rows.get("user-1:pro");
    expect(row?.status).toBe("active");
    expect(row?.periodStart.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(row?.periodEnd.toISOString()).toBe("2026-04-10T12:00:00.000Z");
  });

  it("records that a manual transfer does not renew by itself", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-1",
      planId: "pro",
      provider: "manual",
      providerSubscriptionId: "payment-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    expect(rows.get("user-1:pro")?.autoRenew).toBe(false);
  });

  it("keeps one subscription row per customer and plan", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-1",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    await lifecycle.grantPaidPeriod({
      userId: "user-1",
      planId: "pro",
      provider: "manual",
      providerSubscriptionId: "payment-1",
      paidAt: new Date("2026-04-05T12:00:00.000Z"),
    });
    expect(rows.size).toBe(1);
    const row = rows.get("user-1:pro");
    expect(row?.provider).toBe("manual");
    expect(row?.providerSubscriptionId).toBe("payment-1");
    // The renewal stacks onto the coverage that was still running.
    expect(row?.periodStart.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(row?.periodEnd.toISOString()).toBe("2026-05-10T12:00:00.000Z");
  });

  it("applies an authoritative provider period", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    const claim = await lifecycle.claim({ userId: "user-2", planId: "pro" });
    expect(claim).toBeNull();
    const outcome = await lifecycle.applyProviderState({
      claim,
      state: {
        userId: "user-2",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "active",
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-01T00:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
    expect(outcome.outcome).toBe("applied");
    expect(rows.get("user-2:pro")?.autoRenew).toBe(true);
  });

  it("ignores an event from a rail the customer already left", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-3",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const claim = await lifecycle.claim({ userId: "user-3", planId: "pro" });
    const outcome = await lifecycle.applyProviderState({
      claim,
      state: {
        userId: "user-3",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-old",
        status: "canceled",
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-01T00:00:00.000Z"),
        autoRenew: false,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-11T00:00:00.000Z"),
      },
    });
    expect(outcome.outcome).toBe("skipped");
    expect(rows.get("user-3:pro")?.status).toBe("active");
    expect(rows.get("user-3:pro")?.provider).toBe("chargily");
  });

  it("moves the subscription to a rail the customer bought on", async () => {
    const { repository, rows } = createRepository();
    const cancelled: Array<{ provider: string; providerSubscriptionId: string }> = [];
    const lifecycle = billing.createSubscriptionLifecycle({
      repository,
      planCatalog,
      canceller: {
        async cancel(input) {
          cancelled.push(input);
        },
      },
    });
    await lifecycle.grantPaidPeriod({
      userId: "user-8",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    // The customer buys the same plan on the card rail.
    const claim = await lifecycle.claim({ userId: "user-8", planId: "pro" });
    const outcome = await lifecycle.applyProviderState({
      claim,
      allowsRailSwitch: true,
      state: {
        userId: "user-8",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "active",
        periodStart: new Date("2026-04-01T00:00:00.000Z"),
        periodEnd: new Date("2026-05-01T00:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    });
    expect(outcome.outcome).toBe("applied");
    expect(rows.get("user-8:pro")?.provider).toBe("stripe");
    expect(rows.get("user-8:pro")?.providerSubscriptionId).toBe("sub-1");
    // The rail the customer left must not keep charging them.
    expect(cancelled).toEqual([{ provider: "chargily", providerSubscriptionId: "checkout-1" }]);
  });

  it("adds the length of a purchase to the coverage it is bought on top of", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-10",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const claim = await lifecycle.claim({ userId: "user-10", planId: "pro" });
    // The customer buys the same plan on the card rail ten days later.
    const outcome = await lifecycle.applyProviderState({
      claim,
      allowsRailSwitch: true,
      state: {
        userId: "user-10",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "active",
        periodStart: new Date("2026-03-20T12:00:00.000Z"),
        periodEnd: new Date("2026-04-20T12:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    });
    expect(outcome.outcome).toBe("applied");
    const row = rows.get("user-10:pro");
    // Two paid months are two months of coverage, not one and a half.
    expect(row?.periodStart.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(row?.periodEnd.toISOString()).toBe("2026-05-11T12:00:00.000Z");
    expect(row?.provider).toBe("stripe");
  });

  it("leaves the rail of record untouched when a stale purchase arrives", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-11",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
      providerEventAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    // The card of this customer starts failing, so the rail reports it.
    await lifecycle.applyProviderState({
      claim: await lifecycle.claim({ userId: "user-11", planId: "pro" }),
      state: {
        userId: "user-11",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "past_due",
        periodStart: new Date("2026-03-10T12:00:00.000Z"),
        periodEnd: new Date("2026-04-10T12:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-12T12:00:00.000Z"),
      },
    });
    expect(rows.get("user-11:pro")?.status).toBe("past_due");
    // An older payment on another rail adds its coverage and nothing else.
    const outcome = await lifecycle.grantPaidPeriod({
      userId: "user-11",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-old",
      paidAt: new Date("2026-03-05T12:00:00.000Z"),
      providerEventAt: new Date("2026-03-05T12:00:00.000Z"),
    });
    expect(outcome.outcome).toBe("applied");
    const row = rows.get("user-11:pro");
    // The rail of record still reports the failed card.
    expect(row?.provider).toBe("stripe");
    expect(row?.status).toBe("past_due");
    expect(row?.providerSubscriptionId).toBe("sub-1");
    // The marker of the newest event does not move backwards.
    expect(row?.providerEventAt?.toISOString()).toBe("2026-03-12T12:00:00.000Z");
  });

  it("keeps the newer rail but still adds the coverage of an older purchase", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-9",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
      providerEventAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const claim = await lifecycle.claim({ userId: "user-9", planId: "pro" });
    const outcome = await lifecycle.applyProviderState({
      claim,
      allowsRailSwitch: true,
      state: {
        userId: "user-9",
        planId: "pro",
        provider: "chargily",
        providerSubscriptionId: "checkout-old",
        status: "active",
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-01T00:00:00.000Z"),
        autoRenew: false,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });
    // The payment is not lost: its length is added to the coverage.
    expect(outcome.outcome).toBe("applied");
    const row = rows.get("user-9:pro");
    // The newer purchase keeps the rail of record.
    expect(row?.provider).toBe("stripe");
    expect(row?.providerSubscriptionId).toBe("sub-1");
    // The coverage is the current window plus the length of the purchase.
    expect(row?.periodStart.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(row?.periodEnd.toISOString()).toBe("2026-05-08T12:00:00.000Z");
  });

  it("reports a superseded write instead of clobbering a newer state", async () => {
    const { repository } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    const stale = await lifecycle.claim({ userId: "user-4", planId: "pro" });
    // A claim taken before the row existed cannot take over a row another
    // writer has already created.
    expect(stale).toBeNull();
    await lifecycle.grantPaidPeriod({
      userId: "user-4",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const outcome = await lifecycle.applyProviderState({
      claim: stale,
      state: {
        userId: "user-4",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "active",
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-01T00:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
    expect(outcome.outcome).toBe("superseded");
  });

  it("rejects a write whose fencing token was overtaken", async () => {
    const { repository } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({ repository, planCatalog });
    await lifecycle.grantPaidPeriod({
      userId: "user-7",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const claim = await lifecycle.claim({ userId: "user-7", planId: "pro" });
    expect(claim).not.toBeNull();
    // Another writer claims a newer version before this one commits.
    await lifecycle.grantPaidPeriod({
      userId: "user-7",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-20T12:00:00.000Z"),
    });
    const overtaken = await lifecycle.applyProviderState({
      claim,
      state: {
        userId: "user-7",
        planId: "pro",
        provider: "stripe",
        providerSubscriptionId: "sub-1",
        status: "active",
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-01T00:00:00.000Z"),
        autoRenew: true,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        metadata: null,
        providerEventAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
    expect(overtaken.outcome).toBe("superseded");
  });

  it("stops the rail a customer left from charging again", async () => {
    const { repository, rows } = createRepository();
    const cancelled: Array<{ provider: string; providerSubscriptionId: string }> = [];
    const lifecycle = billing.createSubscriptionLifecycle({
      repository,
      planCatalog,
      canceller: {
        async cancel(input) {
          cancelled.push(input);
        },
      },
    });
    await lifecycle.grantPaidPeriod({
      userId: "user-5",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    await lifecycle.grantPaidPeriod({
      userId: "user-5",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-04-01T12:00:00.000Z"),
    });
    expect(cancelled).toEqual([{ provider: "stripe", providerSubscriptionId: "sub-1" }]);
    expect(rows.get("user-5:pro")?.provider).toBe("chargily");
  });

  it("keeps the grant when the previous rail cannot be stopped", async () => {
    const { repository, rows } = createRepository();
    const lifecycle = billing.createSubscriptionLifecycle({
      repository,
      planCatalog,
      canceller: {
        async cancel() {
          throw new Error("provider unavailable");
        },
      },
    });
    await lifecycle.grantPaidPeriod({
      userId: "user-6",
      planId: "pro",
      provider: "stripe",
      providerSubscriptionId: "sub-1",
      paidAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    const outcome = await lifecycle.grantPaidPeriod({
      userId: "user-6",
      planId: "pro",
      provider: "chargily",
      providerSubscriptionId: "checkout-1",
      paidAt: new Date("2026-04-01T12:00:00.000Z"),
    });
    expect(outcome.outcome).toBe("applied");
    expect(rows.get("user-6:pro")?.provider).toBe("chargily");
  });
});
