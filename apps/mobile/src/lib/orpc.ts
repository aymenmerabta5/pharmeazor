import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { RouterClient } from "@orpc/server";
import { Platform } from "react-native";
import type { appRouter } from "@repo/api";
import { authClient } from "./auth-client";

import { env } from "@repo/config/expo";

function getBaseUrl(): string {
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.username &&
        !parsed.password
      ) {
        return parsed.toString().replace(/\/$/, "");
      }
    } catch {}
  }
  throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
}

const link = new RPCLink({
  url: `${getBaseUrl()}/api/rpc`,
  headers: async (): Promise<Record<string, string>> => {
    if (Platform.OS === "web") return {};
    const cookie = await authClient.getCookie();
    // Non-simple CSRF signal only; the Better Auth cookie still supplies identity.
    const headers: Record<string, string> = { "x-ghostinit-native-client": "expo" };
    if (cookie) headers.cookie = cookie;
    return headers;
  },
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const orpcClient: RouterClient<typeof appRouter> = createORPCClient(link);
export const orpc = createORPCReactQueryUtils(orpcClient);

export function createApiClient() {
  return orpcClient;
}
export type ApiClient = typeof orpcClient;
