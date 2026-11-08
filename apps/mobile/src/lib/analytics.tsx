import * as React from "react";
import { useSegments } from "expo-router";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { getClient } from "./analytics-client";
import {
  EVENT_NAME,
  validProperties,
  type ExpoAnalyticsAdapter,
  type ExpoAnalyticsProviderProps,
} from "./analytics-model";
export { resolveExpoAnalyticsConfig } from "./analytics-client";
export type {
  AnalyticsPrimitive,
  AnalyticsProperties,
  ExpoAnalyticsAdapter,
  ExpoAnalyticsProviderProps,
} from "./analytics-model";

const disabledAdapter: ExpoAnalyticsAdapter = Object.freeze({
  enabled: false,
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  optIn: async () => undefined,
  optOut: async () => undefined,
  flush: async () => undefined,
});

const AnalyticsContext = React.createContext<ExpoAnalyticsAdapter>(disabledAdapter);

function ActiveAnalytics({ children }: { children: React.ReactNode }): React.JSX.Element {
  const posthog = usePostHog();
  const segments = useSegments();
  const routeKey = segments.join("/");
  const previousRoute = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const screenName = routeKey ? "/" + routeKey : "/";
    void posthog.screen(screenName, { route_template: screenName }).catch(() => undefined);
  }, [posthog, routeKey]);

  const adapter = React.useMemo<ExpoAnalyticsAdapter>(
    () => ({
      enabled: true,
      capture(event, properties) {
        if (!EVENT_NAME.test(event) || !validProperties(properties)) return;
        void Promise.resolve(posthog.capture(event, properties)).catch(() => undefined);
      },
      identify(distinctId, properties) {
        if (!distinctId || distinctId.length > 256 || !validProperties(properties)) return;
        posthog.identify(distinctId, properties);
      },
      reset() {
        posthog.reset();
      },
      async optIn() {
        await posthog.optIn();
      },
      async optOut() {
        await posthog.optOut();
      },
      async flush() {
        await posthog.flush();
      },
    }),
    [posthog],
  );

  return <AnalyticsContext.Provider value={adapter}>{children}</AnalyticsContext.Provider>;
}

export function ExpoAnalyticsProvider({
  children,
  initiallyOptedOut = false,
}: ExpoAnalyticsProviderProps): React.JSX.Element {
  const client = getClient(initiallyOptedOut);
  if (!client) {
    return (
      <AnalyticsContext.Provider value={disabledAdapter}>{children}</AnalyticsContext.Provider>
    );
  }
  return (
    <PostHogProvider client={client} autocapture={false} debug={false}>
      <ActiveAnalytics>{children}</ActiveAnalytics>
    </PostHogProvider>
  );
}

export function useExpoAnalytics(): ExpoAnalyticsAdapter {
  return React.useContext(AnalyticsContext);
}
