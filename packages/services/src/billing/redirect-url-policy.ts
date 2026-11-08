import "server-only";
import { ServiceError } from "../errors";

export type BillingRedirectErrorCode = "INVALID_REDIRECT";
export type BillingRedirectValidation =
  | { ok: true; value: string }
  | { ok: false; error: ServiceError<BillingRedirectErrorCode> };

const APP_URL_ENVIRONMENT_KEYS = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "VITE_APP_URL",
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_API_URL",
] as const;

function isLoopbackBillingHostname(hostname: string): boolean {
  const ipv4 = hostname.split(".");
  const isIpv4Loopback =
    ipv4.length === 4 &&
    ipv4[0] === "127" &&
    ipv4.every((part) => {
      const octet = Number(part);
      return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part;
    });
  return hostname === "localhost" || isIpv4Loopback || hostname === "::1" || hostname === "[::1]";
}

function trustedOrigin(value: string | undefined): string | null {
  if (!value || value.startsWith("REPLACE_WITH")) return null;
  try {
    const parsed = new URL(value);
    if (
      value !== value.trim() ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "" && parsed.pathname !== "/") ||
      value.includes("?") ||
      value.includes("#") ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" && !isLoopbackBillingHostname(parsed.hostname))
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

interface TrustedDeepLink {
  protocol: string;
  hostname: string;
}

function billingDeepLinkRoute(value: URL): string {
  const route = value.hostname ? `/${value.hostname}${value.pathname}` : value.pathname;
  return route.replace(/\/$/, "");
}

function trustedBillingDeepLink(value: string | undefined): TrustedDeepLink | null {
  if (!value || value.startsWith("REPLACE_WITH")) return null;
  try {
    const parsed = new URL(value);
    if (
      value !== value.trim() ||
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      ["javascript:", "data:", "file:", "blob:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      value.includes("?") ||
      value.includes("#") ||
      parsed.search ||
      parsed.hash ||
      billingDeepLinkRoute(parsed) !== "/billing"
    )
      return null;
    return { protocol: parsed.protocol, hostname: parsed.hostname };
  } catch {
    return null;
  }
}

export function validateBillingRedirectUrl(
  value: string,
  label: string,
  readEnvironment: (name: string) => string | undefined,
): BillingRedirectValidation {
  const allowedOrigins = new Set(
    APP_URL_ENVIRONMENT_KEYS.flatMap((name) => {
      const origin = trustedOrigin(readEnvironment(name));
      return origin ? [origin] : [];
    }),
  );
  const allowedDeepLink = trustedBillingDeepLink(readEnvironment("EXPO_PUBLIC_APP_URL"));
  if (allowedOrigins.size === 0 && !allowedDeepLink) {
    return {
      ok: false,
      error: new ServiceError(
        "INVALID_REDIRECT",
        "Billing application origin or deep link is not configured",
      ),
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    return {
      ok: false,
      error: new ServiceError("INVALID_REDIRECT", `${label} must be an absolute application URL`, {
        cause,
      }),
    };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: new ServiceError(
        "INVALID_REDIRECT",
        `${label} must use a configured application destination`,
      ),
    };
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") {
    if (!allowedOrigins.has(parsed.origin)) {
      return {
        ok: false,
        error: new ServiceError(
          "INVALID_REDIRECT",
          `${label} must use a configured application origin`,
        ),
      };
    }
  } else if (
    !allowedDeepLink ||
    parsed.protocol !== allowedDeepLink.protocol ||
    parsed.hostname !== allowedDeepLink.hostname ||
    billingDeepLinkRoute(parsed) !== "/billing"
  ) {
    return {
      ok: false,
      error: new ServiceError(
        "INVALID_REDIRECT",
        `${label} must use the configured billing deep link`,
      ),
    };
  }
  return { ok: true, value: parsed.toString() };
}
