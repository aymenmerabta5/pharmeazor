/**
 * Billing domain model.
 *
 * `BILLING_PROVIDER_NAMES` is the single list of payment rails. It mirrors the
 * `billing_provider` Postgres enum, so a row can always name the rail that
 * funded it.
 *
 * Only some rails have a checkout adapter. Stripe and Chargily redirect the
 * customer to a hosted page and report back over a webhook; manual is settled
 * by a bank transfer that an administrator approves. `BILLING_CHECKOUT_PROVIDER_NAMES`
 * is the subset that can start a hosted checkout, and
 * `BILLING_PORTAL_PROVIDER_NAMES` is the narrower subset that can host a
 * self-service subscription portal.
 */
export const BILLING_PROVIDER_NAMES = ["stripe", "chargily", "manual"] as const;
export type BillingProviderName = (typeof BILLING_PROVIDER_NAMES)[number];

export const BILLING_CHECKOUT_PROVIDER_NAMES = ["stripe", "chargily"] as const;
export type BillingCheckoutProviderName = (typeof BILLING_CHECKOUT_PROVIDER_NAMES)[number];

export const BILLING_PORTAL_PROVIDER_NAMES = ["stripe"] as const;
export type BillingPortalProviderName = (typeof BILLING_PORTAL_PROVIDER_NAMES)[number];

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "expired"
  | "on_trial"
  | "trial_ended";

export type CheckoutStatus = "pending" | "paid" | "completed" | "failed" | "open" | "expired";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type LicenseKeyStatus = "active" | "revoked" | "expired";
export type RecurringInterval = "month" | "year" | "week" | "day" | "one_time" | null;

export interface CheckoutSession {
  id: string;
  url: string;
  provider: BillingProviderName;
  providerCheckoutId?: string;
  status: CheckoutStatus;
  amount?: number;
  currency?: string;
  priceId?: string;
  customerId?: string;
  metadata?: Record<string, unknown> | null;
}

export interface Subscription {
  id: string;
  provider: BillingProviderName;
  providerSubscriptionId: string;
  userId: string;
  /** The plan this subscription grants. */
  planId: string;
  status: SubscriptionStatus;
  /** Start of the currently covered window. */
  currentPeriodStart?: Date | null;
  /** End of the currently covered window. This is the expiry. */
  currentPeriodEnd?: Date | null;
  /**
   * True only when the rail charges the customer without a fresh
   * authorization. Stripe renews on its own; Chargily and manual do not, so
   * their rows carry `false` and a renewal needs a new customer payment.
   */
  autoRenew: boolean;
  /** True when the customer asked to stop renewing at the end of the period. */
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date | null;
  priceId?: string | null;
  productId?: string | null;
  metadata?: Record<string, unknown> | null;
  customerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Customer {
  id: string;
  provider: BillingProviderName;
  providerCustomerId: string;
  userId: string;
  email?: string;
  name?: string | null;
  createdAt?: Date;
}

export interface BillingProduct {
  id: string;
  provider: BillingProviderName;
  providerProductId: string;
  name: string;
  description?: string | null;
  createdAt?: Date;
}

export interface BillingPrice {
  id: string;
  provider: BillingProviderName;
  providerPriceId: string;
  productId?: string | null;
  amount: number;
  currency: string;
  recurring?: RecurringInterval;
  createdAt?: Date;
}

export interface Invoice {
  id: string;
  provider: BillingProviderName;
  providerInvoiceId: string;
  subscriptionId?: string | null;
  customerId?: string | null;
  paid: boolean;
  amount: number;
  tax?: number | null;
  currency?: string;
  status: InvoiceStatus;
  hostedUrl?: string | null;
  createdAt?: Date;
}

export interface LicenseKey {
  id: string;
  subscriptionId?: string | null;
  key: string;
  status: LicenseKeyStatus;
  provider: BillingProviderName;
  createdAt?: Date;
}

export interface UsageEvent {
  id: string;
  subscriptionId?: string | null;
  name: string;
  credits?: number;
  externalCustomerId?: string;
  organizationId?: string;
  externalId?: string;
  provider: BillingProviderName;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface BillingEvent<TPayload = unknown> {
  id: string;
  provider: BillingProviderName;
  providerEventId: string;
  type: string;
  payload: TPayload;
  processed?: boolean;
  createdAt?: Date;
}

export interface VerifiedEvent<TPayload = unknown> {
  valid: boolean;
  event?: BillingEvent<TPayload>;
  error?: string;
}
