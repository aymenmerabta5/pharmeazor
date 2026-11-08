"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { JsonType, PostHogInterface } from "posthog-js";
import { usePostHogContext } from "./provider";
import { captureClientEvent } from "./posthog-client";
import type { AnalyticsEventName, EventProperties, ExperimentKey, FeatureFlagKey } from "../types";

export function usePostHog() {
  const ctx = usePostHogContext();
  return ctx.client;
}

export function useAnalytics() {
  const ctx = usePostHogContext();
  const capture = useCallback((event: AnalyticsEventName, properties?: EventProperties) => {
    captureClientEvent(event, properties as Record<string, unknown>);
  }, []);

  const identify = useCallback(
    (distinctId: string, traits?: Record<string, unknown>) => {
      try {
        ctx.client?.identify(distinctId, traits);
      } catch {}
    },
    [ctx.client],
  );

  const alias = useCallback(
    (aliasId: string) => {
      try {
        ctx.client?.alias(aliasId);
      } catch {}
    },
    [ctx.client],
  );

  const reset = useCallback(() => {
    try {
      ctx.client?.reset();
    } catch {}
  }, [ctx.client]);

  return {
    client: ctx.client,
    isLoaded: ctx.isLoaded,
    isEnabled: ctx.isEnabled,
    capture,
    identify,
    alias,
    reset,
  };
}

const EMPTY_FLAGS: Record<string, string | boolean> = Object.freeze({});

function createFlagStore<T>(
  client: PostHogInterface | null,
  read: (variants?: Record<string, string | boolean>) => T,
  initial: T,
) {
  let snapshot = initial;
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(changed: () => void) {
      if (!client) return () => undefined;
      let active = true;
      const refresh = (variants?: Record<string, string | boolean>) => {
        if (!active) return;
        try {
          const next = read(variants);
          if (!Object.is(snapshot, next)) {
            snapshot = next;
            changed();
          }
        } catch {
          /* A disabled SDK keeps the last observable snapshot. */
        }
      };
      refresh();
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = client.onFeatureFlags((_keys, variants) => refresh(variants));
      } catch {
        /* Optional analytics stays inert when unavailable. */
      }
      return () => {
        active = false;
        try {
          unsubscribe?.();
        } catch {
          /* SDK cleanup must not disrupt unmount. */
        }
      };
    },
  };
}

export function useFeatureFlag(key: FeatureFlagKey): string | boolean | undefined {
  const client = usePostHog();
  const store = useMemo(
    () =>
      createFlagStore(
        client,
        (variants) => (variants ? variants[key] : client?.getFeatureFlag(key)),
        undefined,
      ),
    [client, key],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  const flag = useFeatureFlag(key);
  return typeof flag === "boolean" ? flag : flag !== undefined;
}

export function useFeatureFlagPayload(key: FeatureFlagKey): JsonType | undefined {
  const client = usePostHog();
  const store = useMemo(
    () => createFlagStore(client, () => client?.getFeatureFlagPayload(key), undefined),
    [client, key],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useActiveFeatureFlags(): Record<string, string | boolean> {
  const client = usePostHog();
  const store = useMemo(
    () => createFlagStore(client, (variants) => variants ?? EMPTY_FLAGS, EMPTY_FLAGS),
    [client],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useFeatureFlags(): Record<string, string | boolean> {
  return useActiveFeatureFlags();
}

export interface UseExperimentResult {
  variant: string | undefined;
  payload: JsonType | undefined;
  isEnrolled: boolean;
  isLoading: boolean;
}

export function useExperiment(
  key: ExperimentKey,
  options?: { fallback?: string },
): UseExperimentResult {
  const flag = useFeatureFlag(key);
  const payload = useFeatureFlagPayload(key);
  const isLoading = flag === undefined;

  return useMemo(() => {
    const variant = typeof flag === "string" ? flag : flag === true ? "control" : options?.fallback;
    return {
      variant,
      payload,
      isEnrolled: variant !== undefined,
      isLoading,
    };
  }, [flag, payload, options?.fallback, isLoading]);
}

export function useFeatureFlagVariant(key: FeatureFlagKey): string | undefined {
  const flag = useFeatureFlag(key);
  return typeof flag === "string" ? flag : undefined;
}
