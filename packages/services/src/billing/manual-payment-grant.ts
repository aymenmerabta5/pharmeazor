import "server-only";
import type { ManualPaymentReviewHooks } from "@repo/billing/manual";
import type { BillingExecutor, SubscriptionLifecyclePort } from "./subscription-lifecycle.service";

/**
 * The connection the review transaction runs on.
 *
 * The manual repository owns that transaction, so the subscription an
 * approval buys has to be written on it. The shape is opaque in the billing
 * package, so it is checked here before it is used.
 */
function asBillingExecutor(executor: unknown): BillingExecutor {
  const candidate = executor as Partial<BillingExecutor> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.select !== "function" ||
    typeof candidate.insert !== "function" ||
    typeof candidate.update !== "function"
  ) {
    throw new Error("BILLING_EXECUTOR_INVALID: the review connection cannot write subscriptions");
  }
  return executor as BillingExecutor;
}

/**
 * The subscription an approved manual payment buys.
 *
 * The hook runs inside the review transaction, so the credit and the access
 * commit together. A payment is never approved without the period it paid
 * for, and a failure to grant rolls the approval back.
 */
export function createManualSubscriptionGrantHook(deps: {
  lifecycle: SubscriptionLifecyclePort;
}): ManualPaymentReviewHooks {
  return {
    async onApproved(payment, executor) {
      const outcome = await deps.lifecycle.grantPaidPeriod({
        userId: payment.ownerId,
        planId: payment.planId,
        provider: "manual",
        providerSubscriptionId: payment.id,
        // The period starts when the payment was approved, not when it was
        // submitted: the money was settled at approval.
        paidAt: new Date(payment.reviewedAt ?? Date.now()),
        providerEventAt: new Date(payment.reviewedAt ?? Date.now()),
        metadata: {
          manualPaymentId: payment.id,
          method: payment.method,
          reference: payment.reference,
        },
        executor: asBillingExecutor(executor),
      });
      if (outcome.outcome !== "applied") {
        throw new Error(
          `BILLING_MANUAL_GRANT_${outcome.outcome.toUpperCase()}: the approved payment could not grant its period`,
        );
      }
    },
  };
}
