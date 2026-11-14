import { describe, it, expect } from "bun:test";
import { billing } from "@repo/services";

type BillingProviderPort = billing.BillingProviderPort;
type BillingCheckoutRepositoryPort = billing.BillingCheckoutRepositoryPort;
type BillingCustomerLookupPort = billing.BillingCustomerLookupPort;
type BillingPriceCatalogPort = billing.BillingPriceCatalogPort;

const PRICE = {
  providerPriceId: "price_123",
  amountMinor: 2_000,
  currency: "USD",
};

function createDeps(
  overrides: {
    provider?: Partial<BillingProviderPort>;
    priceCatalog?: Partial<BillingPriceCatalogPort>;
  } = {},
) {
  const provider: BillingProviderPort = {
    async createCheckout() {
      return { id: "cs_1", url: "https://checkout.example/cs_1" };
    },
    async createCustomer() {
      return { id: "cus_1", providerCustomerId: "cus_1" };
    },
    async getPrice() {
      return { amountMinor: PRICE.amountMinor, currency: PRICE.currency };
    },
    ...overrides.provider,
  };
  const customerRepository: BillingCustomerLookupPort = {
    async findProviderCustomerId() {
      return "cus_1";
    },
    async saveProviderCustomer() {
      return "cus_1";
    },
  };
  const checkoutRepository: BillingCheckoutRepositoryPort = {
    async claim() {
      return { status: "claimed", leaseToken: "lease" };
    },
    async complete() {
      return await Promise.resolve();
    },
  };
  const priceCatalog: BillingPriceCatalogPort = {
    async resolvePrice() {
      return PRICE;
    },
    ...overrides.priceCatalog,
  };
  return { billingProvider: provider, customerRepository, checkoutRepository, priceCatalog };
}

const input = {
  provider: "stripe" as const,
  userId: "user-1",
  planId: "standard",
  successUrl: "https://app.example/billing/success",
  requestKey: "request-1",
};

describe("checkout service", () => {
  it("starts a checkout for the resolved price", async () => {
    const deps = createDeps();
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe("https://checkout.example/cs_1");
    expect(result.value.planId).toBe("standard");
  });

  it("refuses a checkout when the provider charges a different price", async () => {
    const deps = createDeps({
      provider: {
        async getPrice() {
          return { amountMinor: 10_000, currency: "USD" };
        },
      },
    });
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("BILLING_PRICE_MISMATCH");
  });

  it("refuses a checkout when the provider charges a different currency", async () => {
    const deps = createDeps({
      provider: {
        async getPrice() {
          return { amountMinor: 2_000, currency: "EUR" };
        },
      },
    });
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("BILLING_PRICE_MISMATCH");
  });

  it("starts a checkout when the provider reports the same price", async () => {
    const deps = createDeps({
      provider: {
        async getPrice() {
          return { amountMinor: 2_000, currency: "USD" };
        },
      },
    });
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(true);
  });

  it("refuses a checkout when the provider cannot report its price", async () => {
    const deps = createDeps({
      provider: {
        async getPrice() {
          return null;
        },
      },
    });
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("BILLING_PRICE_UNVERIFIABLE");
  });

  it("refuses a checkout when the price is not provisioned", async () => {
    const deps = createDeps({
      priceCatalog: {
        async resolvePrice() {
          return { ...PRICE, providerPriceId: null };
        },
      },
    });
    const result = await billing.createCheckoutService(input, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("BILLING_PRICE_NOT_PROVISIONED");
  });
});
