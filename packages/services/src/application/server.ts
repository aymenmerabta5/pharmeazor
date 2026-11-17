import "server-only";
import {
  createManualPaymentRepository,
  createManualPaymentService,
  type ManualPaymentConfig,
} from "@repo/billing/manual";
import { postgresWalletRepository } from "@repo/billing/wallet";
import { auth } from "@repo/auth/server";
import { createRequestApplication, type BillingApplicationPort } from "./facade";
import { RequestApplicationError } from "./errors";
import { rateLimit } from "./rate-limit";
import type {
  BillingBalancePurchaseInput,
  BillingCheckoutInput,
  BillingPaymentLinkInput,
  BillingPortalInput,
  RequestPrincipal,
} from "./types";
import { createAdminServiceForRequest } from "./composition/admin";
import {
  createIdentityServiceForRequest,
  resolveIdentityActorForRequest,
} from "./composition/identity";
import { getBillingProvider } from "@repo/billing";
import {
  billingCheckoutRepository,
  billingCustomerRepository,
  billingPlanCatalog,
  billingSnapshotRepository,
  assertProviderPriceMatchesCatalog,
  createCheckoutService,
  createPortalSessionService,
  listSubscriptionsService,
  purchasePlanWithBalanceService,
  validateBillingRedirectUrl,
  subscriptionLifecycle,
} from "../billing/server";
import { toPublicPlans } from "../billing/plan-catalog-view";

/**
 * The receiving account for bank transfers.
 *
 * It is environment-driven because the account details are an operator
 * decision, not a code change: enabling the rail, naming the account holder
 * and listing the accepted transfer methods all happen in `.env.local` (or
 * the deployment environment) without a rebuild.
 */
function manualPaymentConfigFromEnvironment(): ManualPaymentConfig {
  const methods = (process.env.MANUAL_PAYMENT_METHODS ?? "BaridiMob,Bank transfer")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return {
    enabled: process.env.MANUAL_PAYMENTS_ENABLED === "true",
    currency: "DZD",
    receiverInstructions: process.env.MANUAL_PAYMENT_INSTRUCTIONS?.trim() ?? "",
    allowedMethods: methods,
  };
}

/**
 * The manual rail sells credit, not a plan.
 *
 * An approval credits the wallet; access is granted later, when the customer
 * spends that credit from the pricing page. Nothing about a receipt can grant
 * a subscription on its own.
 */
const manualBillingService = createManualPaymentService(
  createManualPaymentRepository(),
  manualPaymentConfigFromEnvironment(),
);

async function resolvePrincipal(headers: Headers): Promise<RequestPrincipal | null> {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user) return null;
  const identity = await resolveIdentityActorForRequest({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  if (!identity) return null;
  return {
    userId: identity.user.id,
    identityUserId: identity.user.identityId ?? identity.user.id,
    sessionId: identity.actor.sessionId,
    email: identity.user.email,
    emailVerified: identity.user.emailVerified,
    name: identity.user.name ?? null,
    role: identity.user.role ?? "user",
    banned: identity.user.banned === true,
    authenticatedAt: identity.actor.authenticatedAt,
    activeOrganizationId: identity.actor.activeOrganizationId,
    activeTeamId: identity.actor.activeTeamId,
  };
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: Error },
  message: string,
): T {
  if (result.ok) return result.value;
  const code =
    "code" in result.error && typeof result.error.code === "string" ? result.error.code : null;
  if (code === "NOT_SUPPORTED") {
    throw new RequestApplicationError(
      "APPLICATION_NOT_IMPLEMENTED",
      "Customer portal is not supported",
      { cause: result.error },
    );
  }
  if (code === "CUSTOMER_NOT_FOUND") {
    throw new RequestApplicationError("APPLICATION_NOT_FOUND", "Billing customer not found", {
      cause: result.error,
    });
  }
  throw new RequestApplicationError("APPLICATION_INTERNAL_ERROR", message, { cause: result.error });
}

const billing: BillingApplicationPort = {
  async plans() {
    return { plans: await toPublicPlans(billingPlanCatalog) };
  },
  /**
   * Buy a plan with the wallet.
   *
   * The service resolves the price and writes the debit and the subscription
   * together, so the only failures worth naming are a balance that does not
   * cover the plan and a plan the balance cannot buy.
   */
  async purchaseWithBalance(principal, input: BillingBalancePurchaseInput) {
    const result = await purchasePlanWithBalanceService(
      { ownerId: principal.userId, planId: input.planId, requestKey: input.requestKey },
      {
        repository: postgresWalletRepository,
        planCatalog: billingPlanCatalog,
        lifecycle: subscriptionLifecycle,
      },
    );
    if (result.ok) return result.value;
    const code = (result.error as { code?: unknown }).code;
    if (code === "INSUFFICIENT_FUNDS") {
      throw new RequestApplicationError(
        "APPLICATION_INSUFFICIENT_FUNDS",
        "The balance does not cover this plan",
        { cause: result.error },
      );
    }
    if (code === "NOT_CONFIGURED" || code === "INVALID_INPUT") {
      throw new RequestApplicationError(
        "APPLICATION_BAD_REQUEST",
        "This plan cannot be bought with a balance",
        { cause: result.error },
      );
    }
    throw new RequestApplicationError(
      "APPLICATION_INTERNAL_ERROR",
      "Failed to buy with the balance",
      { cause: result.error },
    );
  },
  async subscriptions(userId) {
    return unwrap(
      await listSubscriptionsService(userId, billingSnapshotRepository),
      "Unable to load billing data",
    );
  },
  async createCheckout(principal, input: BillingCheckoutInput) {
    const successUrl = validateBillingRedirectUrl(
      input.successUrl,
      "Checkout success URL",
      (name) => process.env[name],
    );
    if (!successUrl.ok)
      throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", {
        cause: successUrl.error,
      });
    const failureUrl = input.failureUrl
      ? validateBillingRedirectUrl(
          input.failureUrl,
          "Checkout failure URL",
          (name) => process.env[name],
        )
      : null;
    if (failureUrl && !failureUrl.ok)
      throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", {
        cause: failureUrl.error,
      });
    const cancelUrl = input.cancelUrl
      ? validateBillingRedirectUrl(
          input.cancelUrl,
          "Checkout cancel URL",
          (name) => process.env[name],
        )
      : null;
    if (cancelUrl && !cancelUrl.ok)
      throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid checkout input", {
        cause: cancelUrl.error,
      });
    const provider = await getBillingProvider(input.provider);
    return unwrap(
      await createCheckoutService(
        {
          ...input,
          userId: principal.userId,
          customerEmail: principal.email,
          successUrl: successUrl.value,
          failureUrl: failureUrl?.value,
          cancelUrl: cancelUrl?.value,
        },
        {
          billingProvider: provider,
          customerRepository: billingCustomerRepository,
          checkoutRepository: billingCheckoutRepository,
          priceCatalog: billingPlanCatalog,
        },
      ),
      "Failed to create checkout",
    );
  },
  async createPortalSession(principal, input: BillingPortalInput) {
    const returnUrl = validateBillingRedirectUrl(
      input.returnUrl,
      "Billing portal return URL",
      (name) => process.env[name],
    );
    if (!returnUrl.ok)
      throw new RequestApplicationError("APPLICATION_BAD_REQUEST", "Invalid portal return URL", {
        cause: returnUrl.error,
      });
    const provider = await getBillingProvider(input.provider);
    return unwrap(
      await createPortalSessionService(
        { actorId: principal.userId, provider: input.provider, returnUrl: returnUrl.value },
        {
          billingProvider: provider,
          customerRepository: billingCustomerRepository,
        },
      ),
      "Failed to create portal session",
    );
  },
  async createPaymentLink(_principal, input: BillingPaymentLinkInput) {
    const provider = await getBillingProvider(input.provider);
    if (!provider.createPaymentLink) {
      throw new RequestApplicationError(
        "APPLICATION_NOT_IMPLEMENTED",
        "Payment links are not supported",
      );
    }
    try {
      // The link is scoped to a plan, so it sells that plan's price on this
      // rail. The plan is carried in the link metadata, so a payment made
      // through it can be recognised as a sale of that plan.
      const price = await billingPlanCatalog.resolvePrice({
        provider: input.provider,
        planId: input.planId,
      });
      if (!price.providerPriceId) {
        throw new Error(
          `BILLING_PRICE_NOT_PROVISIONED: ${input.provider} has no price for plan ${input.planId}.`,
        );
      }
      // A link sells the provider's price, so that price has to be the price
      // the catalog advertises.
      await assertProviderPriceMatchesCatalog(
        provider,
        input.provider,
        {
          providerPriceId: price.providerPriceId,
          amountMinor: price.amountMinor,
          currency: price.currency,
        },
        input.planId,
      );
      return await provider.createPaymentLink({
        planId: input.planId,
        name: input.name,
        items: [{ price: price.providerPriceId, quantity: input.quantity ?? 1 }],
        afterCompletionMessage: input.afterCompletionMessage,
        metadata: { planId: input.planId },
      });
    } catch (error) {
      throw new RequestApplicationError(
        "APPLICATION_INTERNAL_ERROR",
        "Failed to create payment link",
        { cause: error },
      );
    }
  },
};

export async function createRequestApplicationForRequest(headers: Headers) {
  const principal = await resolvePrincipal(headers);
  return createRequestApplication({
    principal,
    rateLimit,
    admin: createAdminServiceForRequest(headers),
    identity: createIdentityServiceForRequest(),
    billing,
    manualBilling: manualBillingService,
  });
}
