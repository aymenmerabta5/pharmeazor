/**
 * BillingProvider is the domain-owned contract implemented by vendor adapters.
 * Raw body Buffer MUST be used for webhooks (not req.json).
 */
import type { BillingProviderName } from "./model";
import type {
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  CreatePaymentLinkInput,
  CreatePaymentLinkOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  CreateLicenseKeyInput,
  CreateLicenseKeyOutput,
  IngestUsageEventInput,
  IngestUsageEventOutput,
} from "./inputs";
import type { Subscription } from "./model";

export interface BillingProvider {
  readonly name: BillingProviderName;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput>;
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput>;
  /**
   * Customer portal — Stripe only. Chargily is checkout-only and throws
   * NOT_SUPPORTED. Chargily is checkout-only: renewal requires a new
   * customer-authorized payment.
   */
  createPortalSession?(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput>;
  /** Merchant payment-link creation. Only providers with a native capability implement this. */
  createPaymentLink?(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkOutput>;
  /**
   * Webhook verification — every rail needs the raw Buffer:
   * stripe: await constructEventAsync(buf, sig, secret) for Bun/worker SubtleCrypto
   * chargily: verifySignature(payload Buffer, sig, secret) header "signature"
   */
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput>;
  listSubscriptions?(input: ListSubscriptionsInput): Promise<Subscription[]>;
  /**
   * The price a provider charges for a price id.
   *
   * The catalog holds the price this application advertises; the provider
   * price is what the customer is actually charged. Comparing the two before
   * a checkout starts keeps the two from drifting apart.
   */
  getPrice?(input: {
    providerPriceId: string;
  }): Promise<{ amountMinor: number; currency: string } | null>;
  /**
   * Stop a provider subscription from renewing.
   *
   * Only rails that own a recurring subscription implement this. It exists so
   * that a customer who moves to another rail is not charged by the rail they
   * left behind.
   */
  cancelSubscription?(input: {
    providerSubscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<void>;
  createLicenseKey?(input: CreateLicenseKeyInput): Promise<CreateLicenseKeyOutput>;
  ingestUsageEvent?(input: IngestUsageEventInput): Promise<IngestUsageEventOutput>;
}

export type BillingProviderFactory = (config?: Record<string, unknown>) => BillingProvider;

/**
 * Registry of provider adapters.
 *
 * Only rails that can talk to a hosted payment page register a factory.
 * The manual rail has no adapter: it is settled by a bank transfer that an
 * administrator approves, so it never reaches this registry.
 */
export interface BillingProviderRegistry {
  stripe?: BillingProviderFactory;
  chargily?: BillingProviderFactory;
}
