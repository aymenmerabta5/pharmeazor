import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
export type BillingProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface CheckoutRecord {
  id: string;
  provider: BillingProviderName;
  url: string;
  status: string;
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
}
export interface CreateCheckoutInput {
  provider: BillingProviderName;
  userId: string;
  planId: "pro";
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  quantity?: number;
  requestKey: string;
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
  resolvePrice(input: { provider: BillingProviderName; planId: "pro" }): Promise<string>;
}
export interface CreateCheckoutDeps {
  billingProvider: BillingProviderPort;
  customerRepository: BillingCustomerLookupPort;
  checkoutRepository: BillingCheckoutRepositoryPort;
  priceCatalog: BillingPriceCatalogPort;
}
export type CreateCheckoutOutput = Result<CheckoutRecord, Error>;
export async function createCheckoutService(
  input: CreateCheckoutInput,
  deps: CreateCheckoutDeps,
): Promise<CreateCheckoutOutput> {
  try {
    if (!input.requestKey) throw new Error("requestKey is required");
    const priceId = await deps.priceCatalog.resolvePrice({
      provider: input.provider,
      planId: input.planId,
    });
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
      priceId,
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
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
