import { describe, it, expect } from "bun:test";
import { billing } from "@repo/services";

type SubscriptionLifecyclePort = billing.SubscriptionLifecyclePort;
type BillingPlanCatalogPort = billing.BillingPlanCatalogPort;
type WalletPurchaseCommand = billing.WalletPurchaseCommand;
type WalletRepositoryPort = billing.WalletRepositoryPort;

const REQUEST_KEY = "AAAAAAAAAAAAAAAAAAAAAA";

function createLifecycle(periodEnd = new Date("2026-04-10T12:00:00.000Z")) {
  const grants: Array<Record<string, unknown>> = [];
  const lifecycle: SubscriptionLifecyclePort = {
    async claim() {
      return null;
    },
    async applyProviderState() {
      return { outcome: "skipped", reason: "not used" };
    },
    async grantPaidPeriod(input) {
      grants.push(input as unknown as Record<string, unknown>);
      return {
        outcome: "applied",
        subscription: {
          userId: input.userId,
          planId: input.planId,
          provider: input.provider,
          providerSubscriptionId: input.providerSubscriptionId,
          status: "active",
          periodStart: input.paidAt,
          periodEnd,
          autoRenew: false,
          cancelAtPeriodEnd: false,
        },
      };
    },
  };
  return { lifecycle, grants };
}

function createCatalog(amountMinor: number | null = 210_000) {
  const catalog = {
    async resolvePlan(planId: string) {
      if (planId !== "pro") throw new Error(`BILLING_PLAN_NOT_FOUND: ${planId}`);
      return {
        id: "pro",
        name: "Pro",
        description: null,
        tier: 3,
        interval: "month" as const,
        intervalCount: 1,
      };
    },
    async listPlans() {
      return [];
    },
    async listPrices(planId: string) {
      return amountMinor === null
        ? []
        : [
            {
              planId,
              provider: "manual" as const,
              amountMinor,
              currency: "DZD",
              providerPriceId: null,
            },
          ];
    },
    async resolvePlanIdByProviderPrice() {
      return null;
    },
  };
  return catalog satisfies BillingPlanCatalogPort;
}

function createWallet(overrides: Partial<WalletRepositoryPort> = {}) {
  const purchases: WalletPurchaseCommand[] = [];
  const repository: WalletRepositoryPort = {
    async balance() {
      return 0;
    },
    async purchase(command, grant) {
      purchases.push(command);
      const periodEnd = await grant({ select() {}, insert() {}, update() {} });
      return {
        balanceMinor: 300_000 - command.amountMinor,
        duplicate: false,
        periodEnd,
      };
    },
    ...overrides,
  };
  return { repository, purchases };
}

describe("wallet purchase", () => {
  it("spends the plan's DZD price and grants one period", async () => {
    const { lifecycle, grants } = createLifecycle();
    const { repository, purchases } = createWallet();
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: REQUEST_KEY },
      { repository, planCatalog: createCatalog(), lifecycle },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.amountMinor).toBe(210_000);
    expect(purchases[0]?.requestKey).toBe(REQUEST_KEY);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.provider).toBe("manual");
    expect(grants[0]?.providerSubscriptionId).toBe(`wallet-${REQUEST_KEY}`);
    expect(result.value.periodEnd).toBe("2026-04-10T12:00:00.000Z");
    expect(result.value.balanceMinor).toBe(90_000);
    expect(result.value.duplicate).toBe(false);
  });

  it("rejects a request key that cannot be replayed safely", async () => {
    const { lifecycle } = createLifecycle();
    const { repository, purchases } = createWallet();
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: "short" },
      { repository, planCatalog: createCatalog(), lifecycle },
    );
    expect(result.ok).toBe(false);
    expect(purchases).toHaveLength(0);
  });

  it("refuses a plan the balance has no DZD price for", async () => {
    const { lifecycle } = createLifecycle();
    const { repository, purchases } = createWallet();
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: REQUEST_KEY },
      { repository, planCatalog: createCatalog(null), lifecycle },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error as { code?: string }).code).toBe("NOT_CONFIGURED");
    expect(purchases).toHaveLength(0);
  });

  it("surfaces an insufficient balance as a coded failure", async () => {
    const { lifecycle } = createLifecycle();
    const { repository } = createWallet({
      async purchase() {
        throw Object.assign(new Error("balance too low"), { code: "INSUFFICIENT_FUNDS" });
      },
    });
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: REQUEST_KEY },
      { repository, planCatalog: createCatalog(), lifecycle },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error as { code?: string }).code).toBe("INSUFFICIENT_FUNDS");
  });

  it("refuses a purchase whose period cannot be granted", async () => {
    const lifecycle: SubscriptionLifecyclePort = {
      async claim() {
        return null;
      },
      async applyProviderState() {
        return { outcome: "skipped", reason: "not used" };
      },
      async grantPaidPeriod() {
        return { outcome: "superseded" };
      },
    };
    const { repository } = createWallet();
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: REQUEST_KEY },
      { repository, planCatalog: createCatalog(), lifecycle },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toStartWith("BILLING_WALLET_GRANT_SUPERSEDED");
  });

  it("does not grant twice when the key was already settled", async () => {
    const { lifecycle, grants } = createLifecycle();
    const { repository } = createWallet({
      async purchase() {
        return { balanceMinor: 90_000, duplicate: true, periodEnd: null };
      },
    });
    const result = await billing.purchasePlanWithBalanceService(
      { ownerId: "user-1", planId: "pro", requestKey: REQUEST_KEY },
      { repository, planCatalog: createCatalog(), lifecycle },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(grants).toHaveLength(0);
    expect(result.value.duplicate).toBe(true);
    expect(result.value.periodEnd).toBeNull();
  });
});
