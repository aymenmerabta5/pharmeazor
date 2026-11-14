import { describe, it, expect } from "bun:test";
import {
  BILLING_PLAN_IDS,
  BILLING_USD_DZD_RATE,
  DEFAULT_BILLING_PLANS,
  DEFAULT_BILLING_PRICES,
  addBillingInterval,
  billingPeriodRemainingDays,
  deriveDzdAmountMinor,
  extendBillingPeriod,
  isBillingPeriodCovered,
} from "../src/domain/plans";

describe("billing plans", () => {
  it("offers the three tiers this application sells", () => {
    expect(BILLING_PLAN_IDS).toEqual(["basic", "standard", "pro"]);
    expect(DEFAULT_BILLING_PLANS.map((plan) => plan.id)).toEqual(["basic", "standard", "pro"]);
    expect(DEFAULT_BILLING_PLANS.every((plan) => plan.interval === "month")).toBe(true);
    expect(DEFAULT_BILLING_PLANS.every((plan) => plan.intervalCount === 1)).toBe(true);
  });

  it("prices every tier on every rail", () => {
    for (const planId of BILLING_PLAN_IDS) {
      for (const provider of ["stripe", "chargily", "manual"] as const) {
        const price = DEFAULT_BILLING_PRICES.find(
          (entry) => entry.planId === planId && entry.provider === provider,
        );
        expect(price).toBeDefined();
        expect(price?.amountMinor).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the dollar and dinar ladders matched", () => {
    for (const planId of BILLING_PLAN_IDS) {
      const usd = DEFAULT_BILLING_PRICES.find(
        (entry) => entry.planId === planId && entry.provider === "stripe",
      );
      const dzd = DEFAULT_BILLING_PRICES.find(
        (entry) => entry.planId === planId && entry.provider === "chargily",
      );
      expect(usd?.currency).toBe("USD");
      expect(dzd?.currency).toBe("DZD");
      // The dinar price is the dollar price at the P2P rate, so the two
      // markets charge the same real value for the same plan. The dinar price
      // is rounded to whole hundreds, so the match is close rather than exact.
      const impliedRate = (dzd?.amountMinor ?? 0) / (usd?.amountMinor ?? 1);
      expect(Math.abs(impliedRate - BILLING_USD_DZD_RATE) / BILLING_USD_DZD_RATE).toBeLessThan(
        0.02,
      );
    }
  });

  it("charges the same dinar price on both local rails", () => {
    for (const planId of BILLING_PLAN_IDS) {
      const chargily = DEFAULT_BILLING_PRICES.find(
        (entry) => entry.planId === planId && entry.provider === "chargily",
      );
      const manual = DEFAULT_BILLING_PRICES.find(
        (entry) => entry.planId === planId && entry.provider === "manual",
      );
      expect(manual?.amountMinor).toBe(chargily?.amountMinor);
    }
  });

  it("derives the dinar price from the dollar price", () => {
    expect(deriveDzdAmountMinor(800)).toBe(210_000);
    expect(deriveDzdAmountMinor(2_000)).toBe(520_000);
    expect(deriveDzdAmountMinor(10_000)).toBe(2_590_000);
  });

  it("rejects an unusable dollar amount", () => {
    expect(() => deriveDzdAmountMinor(0)).toThrow();
    expect(() => deriveDzdAmountMinor(-1)).toThrow();
    expect(() => deriveDzdAmountMinor(10.5)).toThrow();
  });
});

describe("billing intervals", () => {
  it("adds calendar months without overflowing a short month", () => {
    const result = addBillingInterval(new Date("2026-01-31T00:00:00.000Z"), "month", 1);
    expect(result.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("adds calendar months into a leap year", () => {
    const result = addBillingInterval(new Date("2028-01-31T00:00:00.000Z"), "month", 1);
    expect(result.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("adds whole years", () => {
    const result = addBillingInterval(new Date("2028-02-29T00:00:00.000Z"), "year", 1);
    expect(result.toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("adds days and weeks", () => {
    expect(addBillingInterval(new Date("2026-03-01T00:00:00.000Z"), "day", 30).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    );
    expect(addBillingInterval(new Date("2026-03-01T00:00:00.000Z"), "week", 2).toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
  });

  it("rejects an invalid count", () => {
    expect(() => addBillingInterval(new Date(), "month", 0)).toThrow();
    expect(() => addBillingInterval(new Date(), "month", 1.5)).toThrow();
  });
});

describe("billing period", () => {
  const plan = { interval: "month" as const, intervalCount: 1 };

  it("buys a period from the payment when nothing is covered", () => {
    const from = new Date("2026-03-10T12:00:00.000Z");
    const period = extendBillingPeriod(plan, from, null);
    expect(period.periodStart.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-04-10T12:00:00.000Z");
  });

  it("stacks an early payment onto the remaining coverage", () => {
    const from = new Date("2026-03-20T12:00:00.000Z");
    const period = extendBillingPeriod(plan, from, {
      periodStart: new Date("2026-03-01T12:00:00.000Z"),
      periodEnd: new Date("2026-04-01T12:00:00.000Z"),
    });
    expect(period.periodStart.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-05-01T12:00:00.000Z");
  });

  it("starts a fresh window once the period has lapsed", () => {
    const from = new Date("2026-05-01T12:00:00.000Z");
    const period = extendBillingPeriod(plan, from, {
      periodStart: new Date("2026-03-01T12:00:00.000Z"),
      periodEnd: new Date("2026-04-01T12:00:00.000Z"),
    });
    expect(period.periodStart.toISOString()).toBe("2026-05-01T12:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });

  it("covers the customer only while the period is running", () => {
    const now = new Date("2026-03-10T00:00:00.000Z");
    expect(isBillingPeriodCovered(new Date("2026-03-11T00:00:00.000Z"), now)).toBe(true);
    expect(isBillingPeriodCovered(new Date("2026-03-09T00:00:00.000Z"), now)).toBe(false);
    expect(isBillingPeriodCovered(null, now)).toBe(false);
    expect(isBillingPeriodCovered(undefined, now)).toBe(false);
  });

  it("reports the days left in a period", () => {
    const now = new Date("2026-03-10T00:00:00.000Z");
    expect(billingPeriodRemainingDays(new Date("2026-03-13T00:00:00.000Z"), now)).toBe(3);
    expect(billingPeriodRemainingDays(new Date("2026-03-01T00:00:00.000Z"), now)).toBe(0);
    expect(billingPeriodRemainingDays(null, now)).toBe(0);
  });
});
