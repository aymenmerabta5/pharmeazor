import { describe, it, expect } from "bun:test";
import { billing } from "@repo/services";

type ManualPayment = billing.ManualPayment;
type SubscriptionLifecyclePort = billing.SubscriptionLifecyclePort;

function createManualPayment(overrides: Partial<ManualPayment> = {}): ManualPayment {
  return {
    id: "payment-1",
    ownerId: "user-1",
    planId: "pro",
    amountMinor: 210_000,
    currency: "DZD",
    status: "approved",
    method: "BaridiMob",
    reference: "REF-1",
    createdAt: "2026-03-10T12:00:00.000Z",
    reviewedAt: "2026-03-10T13:00:00.000Z",
    reviewerId: "admin-1",
    reason: null,
    ...overrides,
  };
}

function createLifecycle() {
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
          periodEnd: input.paidAt,
          autoRenew: false,
          cancelAtPeriodEnd: false,
        },
      };
    },
  };
  return { lifecycle, grants };
}

/** A connection shaped like the review transaction. */
function createExecutor() {
  return {
    select: () => undefined,
    insert: () => undefined,
    update: () => undefined,
  };
}

describe("manual subscription grant", () => {
  it("grants the plan period the approved payment bought", async () => {
    const { lifecycle, grants } = createLifecycle();
    const hooks = billing.createManualSubscriptionGrantHook({ lifecycle });
    await hooks.onApproved?.(createManualPayment(), createExecutor());
    expect(grants).toHaveLength(1);
    expect(grants[0]?.planId).toBe("pro");
    expect(grants[0]?.provider).toBe("manual");
    expect(grants[0]?.providerSubscriptionId).toBe("payment-1");
    expect(grants[0]?.userId).toBe("user-1");
  });

  it("grants the period from the moment the payment was approved", async () => {
    const { lifecycle, grants } = createLifecycle();
    const hooks = billing.createManualSubscriptionGrantHook({ lifecycle });
    await hooks.onApproved?.(createManualPayment(), createExecutor());
    const paidAt = grants[0]?.paidAt as Date;
    expect(paidAt.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  it("refuses to approve when the period cannot be granted", async () => {
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
    const hooks = billing.createManualSubscriptionGrantHook({ lifecycle });
    await expect(hooks.onApproved?.(createManualPayment(), createExecutor())).rejects.toThrow(
      "BILLING_MANUAL_GRANT_SUPERSEDED",
    );
  });

  it("refuses a connection that cannot write the subscription", async () => {
    const { lifecycle } = createLifecycle();
    const hooks = billing.createManualSubscriptionGrantHook({ lifecycle });
    await expect(hooks.onApproved?.(createManualPayment(), null)).rejects.toThrow(
      "BILLING_EXECUTOR_INVALID",
    );
  });
});
