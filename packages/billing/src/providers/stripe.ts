/**
 * Stripe provider barrel — composes split modules for <300 compliance.
 * Original monolith 433 lines now <200 barrel + submodules.
 *
 * Stripe Node v22.6.2 / API 2026-08-26.dahlia.
 * Stripe(SECRET, {apiVersion:'2026-08-26.dahlia'}) checkout.sessions.create line_items mode subscription
 *   automatic_tax success_url cancel_url expand subscription expand[]=subscription
 * billingPortal.sessions.create customer return_url flow_data subscription_update deep-link
 * webhooks.constructEventAsync rawBody Buffer sig secret stripe-signature Buffer.from(await req.arrayBuffer())
 *   NOT req.json() else 403 Webhook Error events checkout.session.completed invoice.paid vs payment_succeeded
 *   subscription updated/deleted customer.subscription.updated customer.subscription.deleted lifecycle broader narrower
 * subscriptions.list customer status active|all|past_due filter
 * createCheckout createCustomer createPortalSession verifyWebhook listSubscriptions rawBody Buffer signature
 * Explicit named re-exports (no export * anti-pattern).
 */

import type {
  BillingProvider,
  BillingProviderName,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  Subscription,
} from "./interface";
import { resolveStripeConfig, getStripeClient } from "./stripe/client";
import { createStripeCheckout } from "./stripe/checkout";
import { createStripeCustomer } from "./stripe/customer";
import { createStripePortalSession } from "./stripe/portal";
import { verifyStripeWebhook } from "./stripe/webhook";
import { listStripeSubscriptions } from "./stripe/subscriptions";

// Explicit named re-exports (no export *)
export { STRIPE_API_VERSION, resolveStripeConfig, getStripeClient } from "./stripe/client";
export {
  mapStripeStatusToDomain,
  mapDomainStatusToStripe,
  resolveStripeStatusFilter,
  mapStripeSubscriptionToDomain,
} from "./stripe/mappers";
export { createStripeCheckout } from "./stripe/checkout";
export { createStripeCustomer } from "./stripe/customer";
export { createStripePortalSession } from "./stripe/portal";
export { verifyStripeWebhook } from "./stripe/webhook";
export { listStripeSubscriptions } from "./stripe/subscriptions";

export function createStripeProvider(config?: Record<string, unknown>): BillingProvider {
  const resolved = resolveStripeConfig(config);
  const stripe = getStripeClient(resolved.secretKey ?? "");

  const provider: BillingProvider = {
    name: "stripe" as BillingProviderName,
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
      return createStripeCheckout(stripe, input);
    },
    createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
      return createStripeCustomer(stripe, input);
    },
    createPortalSession(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput> {
      return createStripePortalSession(stripe, input);
    },
    verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput> {
      return verifyStripeWebhook(stripe, input, resolved.webhookSecret);
    },
    listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
      return listStripeSubscriptions(stripe, input);
    },
  };
  return provider;
}

export const stripeProviderFactory = createStripeProvider;
export default createStripeProvider;
