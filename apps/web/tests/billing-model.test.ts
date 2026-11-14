import { describe, it, expect } from "bun:test";
import { normalizeBillingSnapshot } from "../src/features/billing/model";

describe("billing snapshot", () => {
  it("reads the plan, the expiry and the renewal flag of a subscription", () => {
    const { subscriptions } = normalizeBillingSnapshot({
      subscriptions: [
        {
          id: "sub-1",
          provider: "chargily",
          providerSubscriptionId: "checkout-1",
          status: "active",
          planId: "pro",
          currentPeriodStart: "2026-03-10T00:00:00.000Z",
          currentPeriodEnd: "2026-04-10T00:00:00.000Z",
          autoRenew: false,
          cancelAtPeriodEnd: false,
        },
      ],
      invoices: [],
      licenseKeys: [],
      usageEvents: [],
      plans: [],
    });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.planId).toBe("pro");
    expect(subscriptions[0]?.currentPeriodEnd).toBe("2026-04-10T00:00:00.000Z");
    expect(subscriptions[0]?.autoRenew).toBe(false);
  });

  it("treats a missing renewal flag as no automatic renewal", () => {
    const { subscriptions } = normalizeBillingSnapshot({
      subscriptions: [
        {
          id: "sub-1",
          provider: "stripe",
          providerSubscriptionId: "sub_1",
          status: "active",
          planId: "standard",
        },
      ],
      invoices: [],
      licenseKeys: [],
      usageEvents: [],
      plans: [],
    });
    expect(subscriptions[0]?.autoRenew).toBe(false);
    expect(subscriptions[0]?.cancelAtPeriodEnd).toBe(false);
  });

  it("drops a row that is not a subscription of this application", () => {
    const { subscriptions } = normalizeBillingSnapshot({
      subscriptions: [
        { id: "x", provider: "paddle", providerSubscriptionId: "p", status: "active" },
        { id: "y", provider: "stripe", status: "active" },
        null,
        "nope",
      ],
      invoices: [],
      licenseKeys: [],
      usageEvents: [],
      plans: [],
    });
    expect(subscriptions).toHaveLength(0);
  });

  it("reads the plan catalog with the price of each rail", () => {
    const { plans } = normalizeBillingSnapshot({
      subscriptions: [],
      invoices: [],
      licenseKeys: [],
      usageEvents: [],
      plans: [
        {
          id: "basic",
          name: "Basic",
          tier: 10,
          interval: "month",
          intervalCount: 1,
          prices: [
            { provider: "stripe", amountMinor: 800, currency: "USD" },
            { provider: "chargily", amountMinor: 210_000, currency: "DZD" },
          ],
        },
      ],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.name).toBe("Basic");
    expect(plans[0]?.prices).toHaveLength(2);
    expect(plans[0]?.prices.find((price) => price.provider === "stripe")?.amountMinor).toBe(800);
    expect(plans[0]?.prices.find((price) => price.provider === "chargily")?.amountMinor).toBe(
      210_000,
    );
  });

  it("drops a price row that is not usable", () => {
    const { plans } = normalizeBillingSnapshot({
      subscriptions: [],
      invoices: [],
      licenseKeys: [],
      usageEvents: [],
      plans: [
        {
          id: "basic",
          name: "Basic",
          prices: [
            { provider: "stripe", amountMinor: "eight", currency: "USD" },
            { provider: "paddle", amountMinor: 800, currency: "USD" },
            { provider: "chargily", amountMinor: 210_000, currency: "DZD" },
          ],
        },
      ],
    });
    expect(plans[0]?.prices).toHaveLength(1);
    expect(plans[0]?.prices[0]?.provider).toBe("chargily");
  });

  it("survives a snapshot that carries nothing", () => {
    const snapshot = normalizeBillingSnapshot(null);
    expect(snapshot.subscriptions).toEqual([]);
    expect(snapshot.invoices).toEqual([]);
    expect(snapshot.plans).toEqual([]);
    expect(snapshot.licenseKey).toBeNull();
  });
});
