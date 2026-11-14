import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Every payment rail a subscription can be funded by.
 *
 * `manual` is a rail like the others even though it has no hosted checkout:
 * it settles by bank transfer and administrator approval.
 */
export const billingProviderEnum = pgEnum("billing_provider", ["stripe", "chargily", "manual"]);

export const subscriptionStatusEnum = pgEnum("billing_subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
  "expired",
  "on_trial",
  "trial_ended",
]);

export const checkoutStatusEnum = pgEnum("billing_checkout_status", [
  "pending",
  "paid",
  "completed",
  "failed",
  "open",
  "expired",
]);

export const invoiceStatusEnum = pgEnum("billing_invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

export const licenseKeyStatusEnum = pgEnum("billing_license_key_status", [
  "active",
  "revoked",
  "expired",
]);

export const recurringIntervalEnum = pgEnum("billing_recurring_interval", [
  "month",
  "year",
  "week",
  "day",
  "one_time",
]);
