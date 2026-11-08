import { capture, groupIdentify } from "../server/posthog-server";

export interface BillingTrackInput {
  userId: string;
  organizationId?: string;
  provider: string;
  plan?: string;
  amount?: number;
  currency?: string;
  interval?: "month" | "year" | string;
  metadata?: Record<string, unknown>;
}

export function trackCheckoutStarted(input: BillingTrackInput): void {
  capture({
    distinctId: input.userId,
    event: "checkout_started",
    properties: {
      provider: input.provider,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      interval: input.interval,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackCheckoutCompleted(
  input: BillingTrackInput & { checkoutId?: string; subscriptionId?: string },
): void {
  capture({
    distinctId: input.userId,
    event: "checkout_completed",
    properties: {
      provider: input.provider,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      interval: input.interval,
      checkout_id: input.checkoutId,
      subscription_id: input.subscriptionId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });

  if (input.organizationId) {
    groupIdentify({
      groupType: "organization",
      groupKey: input.organizationId,
      properties: { plan: input.plan, billing_provider: input.provider },
    });
  }
}

export function trackCheckoutFailed(
  input: BillingTrackInput & { reason?: string; code?: string },
): void {
  capture({
    distinctId: input.userId,
    event: "checkout_failed",
    properties: {
      provider: input.provider,
      plan: input.plan,
      reason: input.reason,
      code: input.code,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionCreated(
  input: BillingTrackInput & { subscriptionId: string },
): void {
  capture({
    distinctId: input.userId,
    event: "subscription_created",
    properties: {
      provider: input.provider,
      plan: input.plan,
      subscription_id: input.subscriptionId,
      amount: input.amount,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionUpdated(
  input: BillingTrackInput & { subscriptionId: string; previousPlan?: string },
): void {
  capture({
    distinctId: input.userId,
    event: "subscription_updated",
    properties: {
      provider: input.provider,
      plan: input.plan,
      previous_plan: input.previousPlan,
      subscription_id: input.subscriptionId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackSubscriptionCanceled(
  input: BillingTrackInput & { subscriptionId: string; reason?: string },
): void {
  capture({
    distinctId: input.userId,
    event: "subscription_canceled",
    properties: {
      provider: input.provider,
      plan: input.plan,
      subscription_id: input.subscriptionId,
      reason: input.reason,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackPaymentSucceeded(input: BillingTrackInput & { invoiceId?: string }): void {
  capture({
    distinctId: input.userId,
    event: "payment_succeeded",
    properties: {
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      invoice_id: input.invoiceId,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export function trackPaymentFailed(
  input: BillingTrackInput & { invoiceId?: string; reason?: string },
): void {
  capture({
    distinctId: input.userId,
    event: "payment_failed",
    properties: {
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      invoice_id: input.invoiceId,
      reason: input.reason,
      ...input.metadata,
    },
    groups: input.organizationId ? { organization: input.organizationId } : undefined,
  });
}

export const billingAnalytics = {
  checkoutStarted: trackCheckoutStarted,
  checkoutCompleted: trackCheckoutCompleted,
  checkoutFailed: trackCheckoutFailed,
  subscriptionCreated: trackSubscriptionCreated,
  subscriptionUpdated: trackSubscriptionUpdated,
  subscriptionCanceled: trackSubscriptionCanceled,
  paymentSucceeded: trackPaymentSucceeded,
  paymentFailed: trackPaymentFailed,
};
