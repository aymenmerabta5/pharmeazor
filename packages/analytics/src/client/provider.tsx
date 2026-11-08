"use client";

/**
 * PostHogProvider — client component that bootstraps posthog-js.
 * Bootstrap via RootLayout server: getBootstrapFeatureFlags(distinctId).
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostHogInterface } from "posthog-js";
import { getAnalyticsConfig, isAnalyticsEnabled } from "./config";
import { getPostHogClient, initPostHogClient } from "./posthog-client";
import { PostHogContext } from "./context";
import type { PostHogContextValue } from "./context";

export { PostHogContext, usePostHogContext } from "./context";
export type { PostHogContextValue } from "./context";

export interface PostHogProviderProps {
  children: React.ReactNode;
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  personProperties?: Record<string, unknown>;
  distinctId?: string;
  initialOptedOut?: boolean;
}

export function PostHogProvider({
  children,
  bootstrapFlags,
  bootstrapPayloads,
  personProperties,
  distinctId,
  initialOptedOut,
}: PostHogProviderProps) {
  const [client, setClient] = useState<PostHogInterface | null>(() => getPostHogClient());
  const [isLoaded, setIsLoaded] = useState<boolean>(() => Boolean(getPostHogClient()));
  const [isIdentified, setIsIdentified] = useState<boolean>(false);
  const didInitRef = useRef(false);

  const cfg = useMemo(() => {
    try {
      return getAnalyticsConfig();
    } catch {
      return null;
    }
  }, []);

  const isEnabled = useMemo(() => {
    try {
      return isAnalyticsEnabled();
    } catch {
      return false;
    }
  }, []);

  const initialize = useCallback(async () => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!isEnabled || initialOptedOut) return;
    try {
      const ph = await initPostHogClient({
        bootstrapFlags,
        bootstrapPayloads,
        personProperties,
      });
      setClient(ph);
      setIsLoaded(Boolean(ph));
      if (ph && distinctId) {
        try {
          ph.identify(distinctId, personProperties);
          setIsIdentified(true);
        } catch {}
      }
    } catch (err) {
      console.warn("[analytics] PostHogProvider init failed", err);
    }
  }, [bootstrapFlags, bootstrapPayloads, personProperties, distinctId, isEnabled, initialOptedOut]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!client || !distinctId) return;
    try {
      client.identify(distinctId, personProperties);
      setIsIdentified(true);
    } catch {}
  }, [client, distinctId, personProperties]);

  const value = useMemo<PostHogContextValue>(
    () => ({ client, isLoaded, isEnabled: isEnabled && Boolean(cfg?.key), isIdentified }),
    [client, isLoaded, isEnabled, cfg?.key, isIdentified],
  );

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
}

export default PostHogProvider;
