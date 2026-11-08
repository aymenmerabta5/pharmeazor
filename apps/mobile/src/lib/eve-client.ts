import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { createEveClient, EveClientError, type EveTransport } from "./eve-protocol";
import { env } from "@repo/config/expo";

function configuredApplicationOrigin(): string {
  const configured = env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL;
  if (!configured) throw new EveClientError("Configure EXPO_PUBLIC_API_URL before using Eve.");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new EveClientError("EXPO_PUBLIC_API_URL is invalid.");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new EveClientError("EXPO_PUBLIC_API_URL must be HTTPS or a loopback development origin.");
  }
  return url.origin;
}

function nativeHeaders(origin: string, method: "GET" | "POST"): Headers {
  const headers = new Headers({ Accept: "application/json, application/x-ndjson" });
  if (method === "POST") headers.set("Content-Type", "application/json");
  if (Platform.OS !== "web") {
    const cookie = authClient.getCookie();
    if (!cookie) throw new EveClientError("Sign in before using Eve.", 401);
    headers.set("Cookie", cookie);
    // Native fetch has no browser origin. Assert the configured application
    // origin so the Next-hosted facade can apply the same CSRF boundary.
    headers.set("Origin", origin);
    headers.set("Sec-Fetch-Site", "same-origin");
  }
  return headers;
}

const transport: EveTransport = {
  async request(path, input) {
    const origin = configuredApplicationOrigin();
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location.origin !== origin
    ) {
      throw new EveClientError("Expo web must use the same origin as EXPO_PUBLIC_API_URL.");
    }
    return await fetch(new URL(path, origin).toString(), {
      method: input.method,
      headers: nativeHeaders(origin, input.method),
      ...(input.body === undefined ? {} : { body: input.body }),
      credentials: "include",
      redirect: "manual",
      signal: input.signal,
    });
  },
};

export const eveClient = createEveClient(transport);
export type { EveInvokeOptions, EveInvokeResult, EveSessionCursor } from "./eve-protocol";
