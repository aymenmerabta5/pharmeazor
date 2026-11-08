export function safeBillingProviderUrl(value: string): string {
  const url = new URL(value);
  const localHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password)
    throw new Error("Billing provider returned an unsafe URL");
  return url.toString();
}
