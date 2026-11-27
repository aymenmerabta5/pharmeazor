import * as React from "react";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";
import { isLiveSubscription } from "../lib/billing-liveness";
import { orpcClient } from "../lib/orpc";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function toBillingSubscription(value: unknown): BillingSubscription | undefined {
  if (!isRecord(value)) return undefined;
  const id =
    typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
  if (!id || typeof value.provider !== "string" || typeof value.status !== "string")
    return undefined;
  return {
    id,
    provider: value.provider,
    status: value.status,
    planId: optionalString(value.planId),
    currentPeriodEnd: optionalString(value.currentPeriodEnd),
    priceId: optionalString(value.priceId),
  };
}

/**
 * The account's subscriptions.
 *
 * `enabled` lets the entry redirect hold the request until a session exists,
 * so the marketing screen never asks for a billing list it cannot read.
 */
export function useBilling(enabled = true): UseBillingReturn {
  const [subscriptions, setSubscriptions] = React.useState<BillingSubscription[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // A first enabled render is already loading, even before the effect starts,
  // so a caller that waits for `loading` cannot read an empty list as "none".
  const loading = enabled && !loaded;

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoaded(false);
    setError(null);
    try {
      const data = await orpcClient.billing.subscriptions();
      setSubscriptions(
        data.subscriptions.flatMap((value) => {
          const subscription = toBillingSubscription(value);
          return subscription ? [subscription] : [];
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoaded(true);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) {
      setLoaded(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const hasActiveSubscription = React.useMemo(
    () => subscriptions.some((subscription) => isLiveSubscription(subscription)),
    [subscriptions],
  );

  return { subscriptions, loading, error, refresh, hasActiveSubscription, isLoading: loading };
}
