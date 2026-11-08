"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/orpc";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function toBillingSubscription(value: unknown): BillingSubscription | undefined {
  if (!isRecord(value)) return undefined;
  const { id, provider, status } = value;
  if (typeof id !== "string" || typeof provider !== "string" || typeof status !== "string") {
    return undefined;
  }
  return {
    id,
    provider,
    status,
    currentPeriodEnd: optionalString(value.currentPeriodEnd),
    priceId: optionalString(value.priceId),
    customerId: optionalString(value.customerId),
  };
}

export function useBilling(): UseBillingReturn {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.billing.subscriptions.queryOptions({
      select: (data) =>
        data.subscriptions.flatMap((value) => {
          const subscription = toBillingSubscription(value);
          return subscription ? [subscription] : [];
        }),
    }),
  );

  const refresh = React.useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: orpc.billing.subscriptions.key({ type: "query" }),
    });
  }, [queryClient]);

  const hasActiveSubscription = React.useMemo(() => {
    const list = query.data ?? [];
    return list.some((s) => s.status === "active" || s.status === "trialing");
  }, [query.data]);

  return {
    subscriptions: query.data ?? [],
    loading: query.isPending,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    refresh,
    hasActiveSubscription,
    isLoading: query.isPending,
  };
}
