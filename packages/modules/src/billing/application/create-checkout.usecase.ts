import {
  createCheckoutService,
  validateBillingRedirectUrl,
  type BillingProviderName,
} from "@repo/services/billing";
import type { Result } from "@repo/kernel";
import type {
  CheckoutRecord,
  BillingProviderPort,
  BillingCheckoutRepositoryPort,
  BillingCustomerLookupPort,
  BillingPriceCatalogPort,
} from "@repo/services/billing";

export interface CreateCheckoutUseCaseInput {
  userId: string;
  customerEmail: string;
  provider: BillingProviderName;
  planId: "pro";
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  quantity?: number;
  requestKey: string;
}

type UseCaseDeps = {
  billingProvider: BillingProviderPort;
  customerRepository: BillingCustomerLookupPort;
  checkoutRepository: BillingCheckoutRepositoryPort;
  priceCatalog: BillingPriceCatalogPort;
};

export async function createCheckoutUseCase(
  input: CreateCheckoutUseCaseInput,
  deps: UseCaseDeps,
): Promise<Result<CheckoutRecord, Error>> {
  if (!input.planId || !input.successUrl) {
    return { ok: false, error: new Error("planId and successUrl are required") };
  }
  // Domain invariant: every checkout must be traceable to the authenticated user.
  if (!input.userId) {
    return { ok: false, error: new Error("userId is required") };
  }
  const readEnvironment = (name: string) => process.env[name];
  const successUrl = validateBillingRedirectUrl(
    input.successUrl,
    "Checkout success URL",
    readEnvironment,
  );
  if (!successUrl.ok) return { ok: false, error: successUrl.error };
  const failureUrl = input.failureUrl
    ? validateBillingRedirectUrl(input.failureUrl, "Checkout failure URL", readEnvironment)
    : null;
  if (failureUrl && !failureUrl.ok) return { ok: false, error: failureUrl.error };
  const cancelUrl = input.cancelUrl
    ? validateBillingRedirectUrl(input.cancelUrl, "Checkout cancel URL", readEnvironment)
    : null;
  if (cancelUrl && !cancelUrl.ok) return { ok: false, error: cancelUrl.error };
  // No payment-link creation goes through checkout — it has its own port and
  // its own use-case (see: createPaymentLink flow, Chargily-only).
  return createCheckoutService(
    {
      provider: input.provider,
      userId: input.userId,
      planId: input.planId,
      successUrl: successUrl.value,
      failureUrl: failureUrl?.value,
      cancelUrl: cancelUrl?.value,
      customerEmail: input.customerEmail,
      quantity: input.quantity,
      requestKey: input.requestKey,
    },
    {
      billingProvider: deps.billingProvider,
      customerRepository: deps.customerRepository,
      checkoutRepository: deps.checkoutRepository,
      priceCatalog: deps.priceCatalog,
    },
  );
}
