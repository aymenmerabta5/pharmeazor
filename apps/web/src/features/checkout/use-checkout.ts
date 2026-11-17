"use client";
import * as React from "react";
import type { CheckoutRail } from "@/lib/billing-catalog";
import type { CheckoutOrder } from "./model";
import { usePayWithBalance, useStartCheckout } from "./mutations";

/** Why the last attempt did not complete, in the customer's words. */
export type CheckoutFailure =
  | "railUnavailable"
  | "checkoutFailed"
  | "balanceShort"
  | "balanceUnavailable";

export interface CheckoutState {
  start(rail: CheckoutRail): Promise<void>;
  payWithBalance(): Promise<void>;
  failure: CheckoutFailure | null;
  pendingRail: CheckoutRail | "balance" | null;
}

/**
 * Checkout workflow.
 *
 * One attempt is in flight at a time. The replay key is created before the
 * first submit and kept until it succeeds, so a retry after a dropped response
 * settles the same purchase instead of starting another one.
 */
export function useCheckout(order: CheckoutOrder): CheckoutState {
  const checkout = useStartCheckout();
  const wallet = usePayWithBalance();
  const [failure, setFailure] = React.useState<CheckoutFailure | null>(null);
  const busy = React.useRef(false);
  const balanceKey = React.useRef<string | null>(null);

  async function start(rail: CheckoutRail): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    try {
      const result = await checkout.run({
        rail,
        planId: order.planId,
        origin: window.location.origin,
        requestKey: crypto.randomUUID(),
      });
      if (result.status === "success" && result.isCurrent()) {
        if ("url" in result.data) window.location.assign(result.data.url);
        else
          setFailure(
            result.data.failure === "RAIL_UNAVAILABLE" ? "railUnavailable" : "checkoutFailed",
          );
      } else if (result.status === "error" && result.isCurrent()) {
        setFailure("checkoutFailed");
      }
    } finally {
      busy.current = false;
    }
  }

  async function payWithBalance(): Promise<void> {
    if (busy.current || !order.balance?.canPay) return;
    busy.current = true;
    setFailure(null);
    balanceKey.current ??= crypto.randomUUID();
    try {
      const result = await wallet.run({
        planId: order.planId,
        requestKey: balanceKey.current,
      });
      if (result.status === "success" && result.isCurrent()) {
        if ("periodEnd" in result.data) {
          balanceKey.current = null;
          window.location.assign(
            "/checkout/success?rail=balance&plan=" + encodeURIComponent(order.planId),
          );
          return;
        }
        setFailure(
          result.data.failure === "INSUFFICIENT_FUNDS"
            ? "balanceShort"
            : result.data.failure === "PLAN_UNAVAILABLE"
              ? "balanceUnavailable"
              : "checkoutFailed",
        );
      } else if (result.status === "error" && result.isCurrent()) {
        setFailure("checkoutFailed");
      }
    } finally {
      busy.current = false;
    }
  }

  const pending: CheckoutRail | "balance" | null = wallet.isPending
    ? "balance"
    : checkout.isPending
      ? (checkout.variables?.rail ?? null)
      : null;

  return { start, payWithBalance, failure, pendingRail: pending };
}
