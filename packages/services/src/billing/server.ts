import "server-only";
export {
  createCheckoutService,
  assertProviderPriceMatchesCatalog,
  listSubscriptionsService,
  createPortalSessionService,
  createBillingPlanCatalog,
  createSubscriptionLifecycle,
  validateBillingRedirectUrl,
} from "./index";
export { billingCustomerRepository } from "./billing-customer.repository";
export { billingCheckoutRepository } from "./billing-checkout.repository";
export { billingSnapshotRepository } from "./billing-snapshot.repository";
export { billingPlanRepository, billingPlanCatalog } from "./billing-plan.repository";
export { billingSubscriptionRepository } from "./billing-subscription.repository";

import { createSubscriptionLifecycle } from "./index";
import { billingPlanCatalog } from "./billing-plan.repository";
import { billingSubscriptionRepository } from "./billing-subscription.repository";
import { getBillingProvider } from "@repo/billing";

/**
 * The single write path for subscription state.
 *
 * Every rail goes through it, which is what keeps one customer on one
 * subscription row no matter how they pay.
 */
export const subscriptionLifecycle = createSubscriptionLifecycle({
  repository: billingSubscriptionRepository,
  planCatalog: billingPlanCatalog,
  canceller: {
    /**
     * Stop the rail the customer left from charging again.
     *
     * Only Stripe renews by itself, so it is the only rail that can be
     * stopped here. Chargily and manual transfer never charge unattended.
     */
    async cancel(input) {
      if (input.provider !== "stripe") return;
      const provider = await getBillingProvider("stripe");
      if (!provider.cancelSubscription) {
        throw new Error(`BILLING_CANCEL_UNSUPPORTED: ${input.provider} cannot stop a subscription`);
      }
      await provider.cancelSubscription({
        providerSubscriptionId: input.providerSubscriptionId,
        atPeriodEnd: false,
      });
    },
  },
});
