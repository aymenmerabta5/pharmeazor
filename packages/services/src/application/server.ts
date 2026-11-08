import "server-only";
import { manualPaymentService } from "@repo/billing/manual";
import { auth } from "@repo/auth/server";
import { createRequestApplication, type BillingApplicationPort } from "./facade";
import { RequestApplicationError } from "./errors";
import { rateLimit } from "./rate-limit";
import type {
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
  billingSnapshotRepository,
  createBillingPriceCatalog,
  createCheckoutService,
  createPortalSessionService,
  listSubscriptionsService,
  validateBillingRedirectUrl,
} from "../billing/server";

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

const billingPriceCatalog = createBillingPriceCatalog((name) => process.env[name]);
const billing: BillingApplicationPort = {
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
          priceCatalog: billingPriceCatalog,
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
      return await provider.createPaymentLink({
        ...input,
        items: input.items.map((item) => ({ ...item })),
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
    manualBilling: manualPaymentService,
  });
}
