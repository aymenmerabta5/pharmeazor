import { describe, expect, it } from "bun:test";
import {
  activeSubscription,
  accountBillingSnapshot,
  accountPlanView,
  formatBillingDate,
} from "../src/features/account-billing/model";
import {
  billingTierOfferings,
  headlinePrice,
  normalizeBillingPlans,
  normalizeBillingSubscriptions,
  subscriptionStatus,
} from "../src/lib/billing-catalog";

const plan = (
  id: string,
  interval: "month" | "year",
  amountMinor: number,
  provider: "manual" | "stripe" = "manual",
) => ({
  id,
  name: id,
  description: null,
  tier: 1,
  interval,
  intervalCount: 1,
  prices: [{ provider, amountMinor, currency: "DZD", configured: provider === "manual" }],
});

const catalog = [
  plan("basic", "month", 200_000),
  plan("basic-yearly", "year", 2_000_000),
  plan("standard", "month", 400_000),
  plan("standard-yearly", "year", 4_000_000),
  plan("pro", "month", 600_000),
  plan("pro-yearly", "year", 6_000_000),
];

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_1",
  provider: "manual",
  providerSubscriptionId: "manual:sub_1",
  planId: "standard",
  status: "active",
  currentPeriodStart: "2026-01-01T00:00:00.000Z",
  currentPeriodEnd: "2099-02-01T00:00:00.000Z",
  autoRenew: false,
  cancelAtPeriodEnd: false,
  customerId: null,
  ...overrides,
});

describe("billing catalog", () => {
  it("groups the six plan rows into three tiers and two periods", () => {
    const offerings = billingTierOfferings(normalizeBillingPlans(catalog));
    expect(offerings.map((offering) => offering.tier)).toEqual(["basic", "standard", "pro"]);
    expect(offerings[0]?.monthly?.id).toBe("basic");
    expect(offerings[0]?.yearly?.id).toBe("basic-yearly");
  });

  it("uses the manual price as the headline price", () => {
    const plan = normalizeBillingPlans(catalog).find((entry) => entry.id === "pro");
    expect(plan ? headlinePrice(plan)?.amountMinor : null).toBe(600_000);
  });

  it("drops rows a card cannot render", () => {
    expect(normalizeBillingPlans([{ id: "broken" }, ...catalog])).toHaveLength(6);
    expect(normalizeBillingPlans(null)).toEqual([]);
  });
});

describe("subscription status", () => {
  it("expires a live status whose period has run out", () => {
    const [row] = normalizeBillingSubscriptions([
      subscription({ currentPeriodEnd: "2020-01-01T00:00:00.000Z" }),
    ]);
    expect(row ? subscriptionStatus(row, Date.parse("2026-01-01T00:00:00.000Z")) : null).toBe(
      "expired",
    );
  });

  it("picks the live subscription that covers the account longest", () => {
    const [short, long] = normalizeBillingSubscriptions([
      subscription({ id: "short", currentPeriodEnd: "2026-06-01T00:00:00.000Z" }),
      subscription({ id: "long", currentPeriodEnd: "2027-01-01T00:00:00.000Z" }),
    ]);
    expect(activeSubscription([short!, long!], Date.parse("2026-01-01T00:00:00.000Z"))?.id).toBe(
      "long",
    );
  });

  it("builds the plan view from the catalog row", () => {
    const snapshot = accountBillingSnapshot({
      plans: catalog,
      subscriptions: [subscription({ provider: "stripe", autoRenew: true })],
    });
    const view = accountPlanView(snapshot, Date.parse("2026-01-01T00:00:00.000Z"));
    expect(view?.plan?.id).toBe("standard");
    expect(view?.statusKey).toBe("subscriptionStatusActive");
    expect(view?.periodKey).toBe("periodMonthly");
    expect(view?.canPortal).toBe(true);
    expect(view?.renews).toBe(true);
  });

  it("has no plan view without a live subscription", () => {
    const snapshot = accountBillingSnapshot({ plans: catalog, subscriptions: [] });
    expect(accountPlanView(snapshot)).toBeNull();
  });
});

describe("billing dates", () => {
  it("formats a valid instant and rejects a broken one", () => {
    expect(formatBillingDate("2026-03-01T00:00:00.000Z", "en")).toContain("2026");
    expect(formatBillingDate("not-a-date", "en")).toBeNull();
    expect(formatBillingDate(null, "en")).toBeNull();
  });
});
