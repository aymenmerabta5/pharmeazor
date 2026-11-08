import AsyncStorage from "@react-native-async-storage/async-storage";
import PostHog from "posthog-react-native";
import { env } from "@repo/config/expo";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

function normalizeHost(value: string | undefined): string | null {
  if (!value || value.startsWith("/")) return DEFAULT_POSTHOG_HOST;
  try {
    const parsed = new URL(value);
    const isLocalHttp =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]");
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && !isLocalHttp) return null;
    return (parsed.origin + parsed.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function resolveExpoAnalyticsConfig(): {
  enabled: boolean;
  apiKey: string;
  host: string;
} {
  const apiKey = env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
  const host = normalizeHost(env.EXPO_PUBLIC_POSTHOG_HOST);
  const enabled =
    env.EXPO_PUBLIC_ANALYTICS_DISABLED !== "true" &&
    apiKey.length >= 10 &&
    !apiKey.includes("REPLACE") &&
    !apiKey.toLowerCase().includes("placeholder") &&
    host !== null;
  return { enabled, apiKey, host: host ?? DEFAULT_POSTHOG_HOST };
}

const config = resolveExpoAnalyticsConfig();
let clientInstance: PostHog | null | undefined;

export function getClient(initiallyOptedOut: boolean): PostHog | null {
  if (!config.enabled) return null;
  if (clientInstance !== undefined) return clientInstance;
  clientInstance = new PostHog(config.apiKey, {
    host: config.host,
    persistence: "file",
    customStorage: AsyncStorage,
    defaultOptIn: !initiallyOptedOut,
    captureAppLifecycleEvents: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    enableSessionReplay: false,
  });
  return clientInstance;
}
