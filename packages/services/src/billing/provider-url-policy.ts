import "server-only";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A payment-provider URL, checked before it is stored or handed to the browser.
 *
 * Stripe and Chargily return a URL the customer is sent to. A response that
 * resolves to a plain-HTTP or credential-bearing URL is not a checkout page,
 * so it is refused rather than persisted and followed. Loopback stays allowed
 * so development can redirect to a local provider stub.
 */
export function assertSafeProviderUrl(value: string): string {
  const url = new URL(value);
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  if ((url.protocol !== "https:" && !loopbackHttp) || url.username || url.password) {
    throw new Error(
      "BILLING_PROVIDER_URL_UNSAFE: the payment provider returned a URL that is not safe to open",
    );
  }
  return url.toString();
}
