import type Stripe from "stripe";

/**
 * Stop a Stripe subscription from renewing.
 *
 * `atPeriodEnd` keeps the customer covered until the period they paid for
 * ends and then stops the renewal. Cancelling immediately ends the
 * subscription at once and stops the next charge.
 */
export async function cancelStripeSubscription(
  stripe: Stripe,
  input: { providerSubscriptionId: string; atPeriodEnd: boolean },
): Promise<void> {
  const subscriptionId = input.providerSubscriptionId.trim();
  if (!subscriptionId) {
    throw new Error("STRIPE_CANCEL_MISSING_SUBSCRIPTION_ID: a subscription id is required");
  }
  if (input.atPeriodEnd) {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    return;
  }
  await stripe.subscriptions.cancel(subscriptionId);
}
