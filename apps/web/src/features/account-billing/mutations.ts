"use client";
import { createPortalAction } from "@/app/checkout/actions";
import type { CheckoutFailure } from "@/app/checkout/actions";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";

export type BillingPortalResult = { url: string } | { failure: CheckoutFailure };

/**
 * Open the Stripe customer portal.
 *
 * The portal URL is created for the signed-in customer on the server, so the
 * browser cannot name another customer or another return page.
 */
export function useOpenBillingPortal() {
  return useAuthOwnedMutation<{ origin: string }, BillingPortalResult>((input) =>
    createPortalAction(input),
  );
}
