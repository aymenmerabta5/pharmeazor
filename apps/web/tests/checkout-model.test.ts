import { describe, expect, it } from "bun:test";
import { checkoutOrder } from "../src/features/checkout/model";
import type { BillingPlan } from "../src/lib/billing-catalog";

const plan = (amountMinor: number, configured: boolean): BillingPlan => ({
  id: "standard-yearly",
  name: "Standard",
  description: null,
  tier: 2,
  interval: "year",
  intervalCount: 1,
  prices: [
    { provider: "manual", amountMinor, currency: "DZD", configured },
    { provider: "stripe", amountMinor: amountMinor * 2, currency: "USD", configured },
    { provider: "chargily", amountMinor, currency: "DZD", configured: false },
  ],
});

describe("checkout order", () => {
  it("names the plan and reads the period from the catalog row", () => {
    const order = checkoutOrder(plan(5_000_000, true), 6_000_000);
    expect(order.planId).toBe("standard-yearly");
    expect(order.tier).toBe("standard");
    expect(order.interval).toBe("year");
  });

  it("offers only the rails that are provisioned", () => {
    const order = checkoutOrder(plan(5_000_000, true), 0);
    expect(order.rails.map((rail) => rail.rail)).toEqual(["stripe"]);
  });

  it("keeps the manual price as the balance price", () => {
    const order = checkoutOrder(plan(5_000_000, true), 1_500_000);
    expect(order.balance?.priceMinor).toBe(5_000_000);
    expect(order.balance?.canPay).toBe(false);
    expect(order.balance?.shortfallMinor).toBe(3_500_000);
  });

  it("has no balance option when the catalog sells no DZD price", () => {
    const order = checkoutOrder(
      {
        ...plan(5_000_000, true),
        prices: [{ provider: "stripe", amountMinor: 5_000, currency: "USD", configured: true }],
      },
      10_000_000,
    );
    expect(order.balance).toBeNull();
  });
});
