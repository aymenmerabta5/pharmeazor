import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
import type { BillingCheckoutProviderName } from "@repo/billing";
export type { BillingCheckoutProviderName };
export type BillingProviderName = BillingCheckoutProviderName;
export interface CheckoutRecord {
  id: string;
  provider: BillingProviderName;
  url: string;
  status: string;
  planId: string;
}
export interface BillingProviderPort {
  createCheckout(input: {
    userId: string;
    priceId: string;
    successUrl: string;
    failureUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
    customerId?: string;
    requestKey: string;
    metadata?: Record<string, string>;
    quantity?: number;
  }): Promise<{ id: string; url: string }>;
  createCustomer(input: {
    email: string;
    userId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; providerCustomerId?: string }>;
  /**
   * The price the provider charges for a price id.
   *
   * It is compared with the catalog price before a checkout starts, so the
   * price the customer is shown is the price the customer is charged.
   */
  getPrice?(input: {
    providerPriceId: string;
  }): Promise<{ amountMinor: number; currency: string } | null>;
}
export interface CreateCheckoutInput {
  provider: BillingProviderName;
  userId: string;
  planId: string;
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  quantity?: number;
  requestKey: string;
  currency?: string;
}
export type CheckoutIntentClaim =
  | { status: "claimed"; leaseToken: string }
  | { status: "completed"; checkout: { id: string; url: string } }
  | { status: "in_flight" };
export interface BillingCheckoutRepositoryPort {
  claim(input: {
    actorId: string;
    provider: BillingProviderName;
    requestKey: string;
  }): Promise<CheckoutIntentClaim>;
  complete(input: {
    actorId: string;
    provider: BillingProviderName;
    requestKey: string;
    leaseToken: string;
    providerCheckoutId: string;
    url: string;
  }): Promise<void>;
}
export interface BillingCustomerLookupPort {
  findProviderCustomerId(input: {
    actorId: string;
    provider: BillingProviderName;
  }): Promise<string | null>;
  saveProviderCustomer(input: {
    actorId: string;
    provider: BillingProviderName;
    providerCustomerId: string;
    email: string;
  }): Promise<string>;
}
export interface BillingPriceCatalogPort {
  resolvePrice(input: {
    provider: BillingProviderName;
    planId: string;
    currency?: string;
  }): Promise<{ providerPriceId: string | null; amountMinor: number; currency: string }>;
}
export interface CreateCheckoutDeps {
  billingProvider: BillingProviderPort;
  customerRepository: BillingCustomerLookupPort;
  checkoutRepository: BillingCheckoutRepositoryPort;
  priceCatalog: BillingPriceCatalogPort;
}
/**
 * Check the price the provider charges against the price the catalog
 * advertises.
 *
 * The catalog is what the customer is shown. The provider price is what the
 * customer is charged. They have to be the same price, and the provider has
 * to be able to report it: a payment that cannot be verified is not started.
 */
export async function assertProviderPriceMatchesCatalog(
  provider: BillingProviderPort,
  providerName: BillingProviderName,
  price: { providerPriceId: string; amountMinor: number; currency: string },
  planId: string,
): Promise<void> {
  const providerPrice = await provider.getPrice?.({
    providerPriceId: price.providerPriceId,
  });
  if (!providerPrice) {
    throw new Error(
      `BILLING_PRICE_UNVERIFIABLE: the ${providerName} price ${price.providerPriceId} could not be read, ` +
        `so the amount the customer would be charged cannot be checked against plan ${planId}.`,
    );
  }
  if (
    providerPrice.amountMinor !== price.amountMinor ||
    providerPrice.currency !== price.currency.toUpperCase()
  ) {
    throw new Error(
      `BILLING_PRICE_MISMATCH: the ${providerName} price ${price.providerPriceId} charges ` +
        `${providerPrice.amountMinor} ${providerPrice.currency} but the catalog advertises ` +
        `${price.amountMinor} ${price.currency} for plan ${planId}.`,
    );
  }
}

export type CreateCheckoutOutput = Result<CheckoutRecord, Error>;
export async function createCheckoutService(
  input: CreateCheckoutInput,
  deps: CreateCheckoutDeps,
): Promise<CreateCheckoutOutput> {
  try {
    if (!input.requestKey) throw new Error("requestKey is required");
    const price = await deps.priceCatalog.resolvePrice({
      provider: input.provider,
      planId: input.planId,
      currency: input.currency,
    });
    if (!price.providerPriceId) {
      throw new Error(
        `BILLING_PRICE_NOT_PROVISIONED: ${input.provider} has no price for plan ${input.planId}. ` +
          `Set BILLING_${input.provider.toUpperCase()}_${input.planId.toUpperCase()}_PRICE_ID ` +
          `or provision the provider price.`,
      );
    }
    // The catalog price is what the customer is shown; the provider price is
    // what the customer is charged.
    await assertProviderPriceMatchesCatalog(
      deps.billingProvider,
      input.provider,
      {
        providerPriceId: price.providerPriceId,
        amountMinor: price.amountMinor,
        currency: price.currency,
      },
      input.planId,
    );
    const intent = await deps.checkoutRepository.claim({
      actorId: input.userId,
      provider: input.provider,
      requestKey: input.requestKey,
    });
    if (intent.status === "completed") {
      return ok({
        id: intent.checkout.id,
        provider: input.provider,
        url: intent.checkout.url,
        status: "pending",
        planId: input.planId,
      });
    }
    if (intent.status === "in_flight") {
      throw new Error(
        "CHECKOUT_IN_PROGRESS: retry this requestKey after the current attempt finishes",
      );
    }
    let customerId = await deps.customerRepository.findProviderCustomerId({
      actorId: input.userId,
      provider: input.provider,
    });
    if (!customerId) {
      if (!input.customerEmail)
        throw new Error("customerEmail is required to create a billing customer");
      const customer = await deps.billingProvider.createCustomer({
        email: input.customerEmail,
        userId: input.userId,
        idempotencyKey: `customer:${input.provider}:${input.userId}`,
      });
      customerId = customer.providerCustomerId ?? customer.id;
      if (!customerId) throw new Error("Billing provider did not return a customer id");
      customerId = await deps.customerRepository.saveProviderCustomer({
        actorId: input.userId,
        provider: input.provider,
        providerCustomerId: customerId,
        email: input.customerEmail,
      });
    }
    const checkout = await deps.billingProvider.createCheckout({
      userId: input.userId,
      priceId: price.providerPriceId,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      customerId: customerId ?? undefined,
      requestKey: input.requestKey,
      metadata: { planId: input.planId },
      quantity: input.quantity,
    });
    await deps.checkoutRepository.complete({
      actorId: input.userId,
      provider: input.provider,
      requestKey: input.requestKey,
      leaseToken: intent.leaseToken,
      providerCheckoutId: checkout.id,
      url: checkout.url,
    });
    return ok({
      id: checkout.id,
      provider: input.provider,
      url: checkout.url,
      status: "pending",
      planId: input.planId,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
