import * as React from "react";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";
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
    currentPeriodEnd: optionalString(value.currentPeriodEnd),
    priceId: optionalString(value.priceId),
  };
}

export function useBilling(): UseBillingReturn {
  const [subscriptions, setSubscriptions] = React.useState<BillingSubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveSubscription = React.useMemo(
    () => subscriptions.some((s) => s.status === "active" || s.status === "trialing"),
    [subscriptions],
  );

  return { subscriptions, loading, error, refresh, hasActiveSubscription, isLoading: loading };
}
