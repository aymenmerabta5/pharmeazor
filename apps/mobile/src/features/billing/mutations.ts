import { orpcClient } from "@/lib/orpc";
import type { ProviderName } from "./model";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { env } from "@repo/config/expo";
WebBrowser.maybeCompleteAuthSession();
function secureRequestKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  if (typeof cryptoValue !== "object" || cryptoValue === null)
    throw new Error("Secure random generation is unavailable");
  const randomUUID: unknown = Reflect.get(cryptoValue, "randomUUID");
  if (typeof randomUUID === "function") {
    const value: unknown = Reflect.apply(randomUUID, cryptoValue, []);
    if (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
      return value;
  }
  const getRandomValues: unknown = Reflect.get(cryptoValue, "getRandomValues");
  if (typeof getRandomValues !== "function")
    throw new Error("Secure random generation is unavailable");
  const bytes = new Uint8Array(16);
  Reflect.apply(getRandomValues, cryptoValue, [bytes]);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function billingReturnUrl(status: "success" | "cancel" | "return"): string {
  const configured = new URL(env.EXPO_PUBLIC_APP_URL);
  if (configured.username || configured.password)
    throw new Error("EXPO_PUBLIC_APP_URL must not contain credentials");
  if (configured.protocol === "https:" || configured.protocol === "http:") {
    const result = new URL("/billing", configured);
    result.searchParams.set("checkout", status);
    return result.toString();
  }
  if (["javascript:", "data:", "file:", "blob:"].includes(configured.protocol))
    throw new Error("EXPO_PUBLIC_APP_URL must be an application URL or deep link");
  const route = configured.hostname
    ? `/${configured.hostname}${configured.pathname}`
    : configured.pathname;
  if (route.replace(/\/$/, "") !== "/billing")
    throw new Error("The configured billing deep link must target /billing");
  configured.searchParams.set("checkout", status);
  return configured.toString();
}

async function openProviderUrl(
  value: string,
  isCurrent: () => boolean,
  returnUrl?: string,
): Promise<void> {
  const parsed = new URL(value);
  const localHttp =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password)
    throw new Error("Billing provider returned an unsafe URL");
  if (!isCurrent()) return;
  if (returnUrl) {
    await WebBrowser.openAuthSessionAsync(parsed.toString(), returnUrl);
    return;
  }
  const canOpen = await Linking.canOpenURL(parsed.toString());
  if (!isCurrent()) return;
  if (!canOpen) throw new Error("No browser can open the billing URL");
  await Linking.openURL(parsed.toString());
}

export type BillingAction =
  | { kind: "checkout"; provider: ProviderName }
  | { kind: "portal"; provider: ProviderName }
  | {
      kind: "payment-link";
      provider: ProviderName;
      name: string;
      price: string;
      afterCompletionMessage: string;
    };

export async function performBillingAction(
  input: BillingAction,
  isCurrent: () => boolean,
): Promise<void> {
  if (input.kind === "checkout") {
    const successUrl = billingReturnUrl("success");
    const result = await orpcClient.billing.createCheckout({
      provider: input.provider,
      planId: "pro",
      successUrl,
      failureUrl: billingReturnUrl("cancel"),
      requestKey: secureRequestKey(),
    });
    if (!isCurrent()) return;
    await openProviderUrl(result.url, isCurrent, successUrl);
    return;
  }
  if (input.kind === "portal") {
    const returnUrl = billingReturnUrl("return");
    const result = await orpcClient.billing.createPortalSession({
      provider: input.provider,
      returnUrl,
    });
    if (!isCurrent()) return;
    await openProviderUrl(result.url, isCurrent, returnUrl);
    return;
  }
  const result = await orpcClient.billing.createPaymentLink({
    provider: input.provider,
    name: input.name,
    items: [{ price: input.price, quantity: 1 }],
    afterCompletionMessage: input.afterCompletionMessage,
  });
  if (!isCurrent()) return;
  await openProviderUrl(result.url, isCurrent);
}
