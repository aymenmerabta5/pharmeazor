import "server-only";
import { env } from "@repo/config/server";

export interface AnalyticsConfig {
  key: string;
  host: string;
  enabled: boolean;
  debug: boolean;
  autocapture: boolean;
  capturePageview: boolean;
  capturePageleave: boolean;
  sessionRecording: boolean;
  persistence: "localStorage+cookie" | "cookie" | "memory" | "localStorage";
  personProfiles: "identified_only" | "always" | "never";
  apiEndpoint: string;
  flushAt: number;
  flushIntervalMs: number;
}

export function isAnalyticsEnabled(): boolean {
  const key = env.POSTHOG_API_KEY;
  if (env.ANALYTICS_DISABLED === "true" || !key) return false;
  return !key.includes("REPLACE") && !key.includes("placeholder");
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const isDev = env.NODE_ENV !== "production";
  return {
    key: env.POSTHOG_API_KEY ?? "",
    host: env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: false,
    capturePageview: false,
    capturePageleave: false,
    sessionRecording: false,
    persistence: "memory",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const config = getAnalyticsConfig();
  return {
    key: "",
    host: "",
    enabled: false,
    debug: config.debug,
    apiEndpoint: config.apiEndpoint,
  };
}
