"use client";
import { createCheckoutAction, payWithBalanceAction } from "@/app/checkout/actions";
import type { BalancePurchaseFailure } from "@/app/checkout/actions";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import type { CheckoutRail } from "@/lib/billing-catalog";

export interface CheckoutSubmitInput {
  rail: CheckoutRail;
  planId: string;
  origin: string;
  requestKey: string;
}

export type CheckoutSubmitResult =
  | { url: string }
  | { failure: "RAIL_UNAVAILABLE" | "REQUEST_FAILED" };

export interface BalancePurchaseInput {
  planId: string;
  requestKey: string;
}

export type BalancePurchaseResult =
  | { periodEnd: string | null }
  | { failure: BalancePurchaseFailure };

/**
 * Start a hosted checkout on the chosen rail.
 *
 * The provider URL is produced server-side and checked before it is returned,
 * so the browser can only follow an https (or localhost) checkout page.
 */
export function useStartCheckout() {
  return useAuthOwnedMutation<CheckoutSubmitInput, CheckoutSubmitResult>((input) =>
    createCheckoutAction(input),
  );
}

/**
 * Spend the wallet balance on one period.
 *
 * The amount never leaves the server: this only names the plan and a replay
 * key, which is what makes a retried click buy one period rather than two.
 */
export function usePayWithBalance() {
  return useAuthOwnedMutation<BalancePurchaseInput, BalancePurchaseResult>((input) =>
    payWithBalanceAction(input),
  );
}
