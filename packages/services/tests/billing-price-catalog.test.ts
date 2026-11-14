import { describe, it, expect } from "bun:test";
import { billing } from "@repo/services";

type BillingPlanRepositoryPort = billing.BillingPlanRepositoryPort;

function createRepository(overrides: Partial<BillingPlanRepositoryPort> = {}) {
  const seeded: Array<{ plans: unknown; prices: unknown }> = [];
  const repository: BillingPlanRepositoryPort = {
    async ensureDefaults(input) {
      seeded.push(input);
    },
    async findPlanById(planId) {
      const definition = billing.DEFAULT_BILLING_PLANS.find((plan) => plan.id === planId);
      if (!definition) return null;
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description ?? null,
        tier: definition.tier,
        interval: definition.interval,
        intervalCount: definition.intervalCount,
      };
    },
    async findPrice(input) {
      const definition = billing.DEFAULT_BILLING_PRICES.find(
        (price) =>
          price.planId === input.planId &&
          price.provider === input.provider &&
          price.currency === input.currency,
      );
      if (!definition) return null;
      return {
        planId: definition.planId,
        provider: definition.provider,
        amountMinor: definition.amountMinor,
        currency: definition.currency,
        providerPriceId: null,
      };
    },
    async listPlans() {
      return [];
    },
    async listPrices() {
      return [];
    },
    async findPlanIdByProviderPrice() {
      return null;
    },
    async storeProviderPriceId() {
      // The provider price id is remembered on the row in production.
    },
    ...overrides,
  };
  return { repository, seeded };
}

describe("billing plan catalog", () => {
  it("seeds the built-in plans and prices on first use", async () => {
    const { repository, seeded } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    await catalog.resolvePlan("pro");
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.plans).toEqual(billing.DEFAULT_BILLING_PLANS);
    expect(seeded[0]?.prices).toEqual(billing.DEFAULT_BILLING_PRICES);
  });

  it("resolves a plan with a usable billing interval", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    const plan = await catalog.resolvePlan("pro");
    expect(plan.interval).toBe("month");
    expect(plan.intervalCount).toBe(1);
  });

  it("refuses a plan that does not exist", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    await expect(catalog.resolvePlan("enterprise")).rejects.toThrow("BILLING_PLAN_NOT_FOUND");
  });

  it("refuses a plan id that is not a plain identifier", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    await expect(catalog.resolvePlan("../etc/passwd")).rejects.toThrow("BILLING_PLAN_ID_INVALID");
    await expect(catalog.resolvePlan("Pro Plan")).rejects.toThrow("BILLING_PLAN_ID_INVALID");
  });

  it("prices a plan in the currency of the rail", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: (name) => `price_${name}`,
    });
    const stripe = await catalog.resolvePrice({ provider: "stripe", planId: "pro" });
    const chargily = await catalog.resolvePrice({ provider: "chargily", planId: "pro" });
    const manual = await catalog.resolvePrice({ provider: "manual", planId: "pro" });
    expect(stripe.currency).toBe("USD");
    expect(chargily.currency).toBe("DZD");
    expect(manual.currency).toBe("DZD");
    expect(chargily.amountMinor).toBe(manual.amountMinor);
  });

  it("falls back to the environment when the provider price is not provisioned", async () => {
    const { repository } = createRepository();
    const environment: Record<string, string> = {
      BILLING_STRIPE_PRO_PRICE_ID: "price_env_stripe",
      BILLING_CHARGILY_PRO_PRICE_ID: "price_env_chargily",
    };
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: (name) => environment[name],
    });
    const stripe = await catalog.resolvePrice({ provider: "stripe", planId: "pro" });
    expect(stripe.providerPriceId).toBe("price_env_stripe");
    const chargily = await catalog.resolvePrice({ provider: "chargily", planId: "pro" });
    expect(chargily.providerPriceId).toBe("price_env_chargily");
  });

  it("prefers the provider price stored on the price row", async () => {
    const { repository } = createRepository({
      async findPrice(input) {
        return {
          planId: input.planId,
          provider: input.provider,
          amountMinor: 800,
          currency: input.currency,
          providerPriceId: "price_stored",
        };
      },
    });
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => "price_from_environment",
    });
    const price = await catalog.resolvePrice({ provider: "stripe", planId: "pro" });
    expect(price.providerPriceId).toBe("price_stored");
  });

  it("refuses a price that is not configured at all", async () => {
    const { repository } = createRepository({
      async findPrice() {
        return null;
      },
    });
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    await expect(catalog.resolvePrice({ provider: "stripe", planId: "pro" })).rejects.toThrow(
      "BILLING_PRICE_NOT_FOUND",
    );
  });

  it("refuses a price that is not provisioned on the provider", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    await expect(catalog.resolvePrice({ provider: "stripe", planId: "pro" })).rejects.toThrow(
      "BILLING_PRICE_NOT_PROVISIONED",
    );
  });

  it("refuses a placeholder price", async () => {
    const { repository } = createRepository();
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: (name) =>
        name === "BILLING_STRIPE_PRO_PRICE_ID" ? "REPLACE_WITH_STRIPE_PRICE" : undefined,
    });
    await expect(catalog.resolvePrice({ provider: "stripe", planId: "pro" })).rejects.toThrow(
      "BILLING_PRICE_NOT_PROVISIONED",
    );
  });

  it("finds the plan a provider price sells", async () => {
    const { repository } = createRepository({
      async findPlanIdByProviderPrice() {
        return "standard";
      },
    });
    const catalog = billing.createBillingPlanCatalog({
      repository,
      readEnvironment: () => undefined,
    });
    const planId = await catalog.resolvePlanIdByProviderPrice({
      provider: "stripe",
      providerPriceId: "price_123",
    });
    expect(planId).toBe("standard");
  });
});
