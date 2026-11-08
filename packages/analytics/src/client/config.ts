import { env, isDevelopment } from "@repo/config/next";

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

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export function isAnalyticsEnabled(): boolean {
  if (env.NEXT_PUBLIC_ANALYTICS_DISABLED === "true") return false;
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  return Boolean(key && !key.includes("REPLACE") && !key.includes("placeholder"));
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const isDev = isDevelopment;
  return {
    key: env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    host: env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: parseEnvBoolean(env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE, true),
    capturePageview: false,
    capturePageleave: true,
    sessionRecording: parseEnvBoolean(env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING, !isDev),
    persistence: "localStorage+cookie",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const config = getAnalyticsConfig();
  return {
    key: config.key,
    host: config.host,
    enabled: config.enabled,
    debug: config.debug,
    apiEndpoint: config.apiEndpoint,
  };
}
