export type ProviderName = "stripe" | "chargily" | "manual";
/** The rails that can start a hosted checkout. Manual settles by transfer. */
export type CheckoutProviderName = "stripe" | "chargily";
export type ProviderOption =
  | { id: "stripe"; label: string; checkout: true; portal: true; paymentLink: false }
  | { id: "chargily"; label: string; checkout: true; portal: false; paymentLink: true };
export interface SubscriptionView {
  id: string;
  provider: string;
  status: string;
  planId: string;
  currentPeriodEnd?: string;
  /** True only when the rail charges again without a new authorization. */
  autoRenew: boolean;
}
export interface PlanPriceView {
  provider: ProviderName;
  amountMinor: number;
  currency: string;
}
export interface PlanView {
  id: string;
  name: string;
  tier: number;
  prices: PlanPriceView[];
}
export interface InvoiceView {
  id: string;
  provider: string;
  amount: number;
  currency?: string;
  status: string;
  paid: boolean;
}
export const selectedProviders: readonly ProviderOption[] = [
  { id: "stripe", label: "Stripe", checkout: true, portal: true, paymentLink: false },
  {
    id: "chargily",
    label: "Chargily (EDAHABIA/CIB)",
    checkout: true,
    portal: false,
    paymentLink: true,
  },
];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function id(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
}
export function subscriptionView(value: unknown): SubscriptionView | null {
  if (!record(value) || typeof value.provider !== "string" || typeof value.status !== "string")
    return null;
  const key = id(value);
  if (!key) return null;
  return {
    id: key,
    provider: value.provider,
    status: value.status,
    planId: typeof value.planId === "string" ? value.planId : "",
    ...(typeof value.currentPeriodEnd === "string"
      ? { currentPeriodEnd: value.currentPeriodEnd }
      : {}),
    autoRenew: value.autoRenew === true,
  };
}
export function planView(value: unknown): PlanView | null {
  if (!record(value)) return null;
  const key = id(value);
  if (!key || typeof value.name !== "string") return null;
  const prices = Array.isArray(value.prices)
    ? value.prices.flatMap((entry) => {
        if (!record(entry) || typeof entry.provider !== "string") return [];
        if (typeof entry.amountMinor !== "number" || typeof entry.currency !== "string") return [];
        return [
          {
            provider: entry.provider as ProviderName,
            amountMinor: entry.amountMinor,
            currency: entry.currency,
          },
        ];
      })
    : [];
  return {
    id: key,
    name: value.name,
    tier: typeof value.tier === "number" ? value.tier : 0,
    prices,
  };
}
export function invoiceView(value: unknown): InvoiceView | null {
  if (
    !record(value) ||
    typeof value.provider !== "string" ||
    typeof value.amount !== "number" ||
    typeof value.status !== "string" ||
    typeof value.paid !== "boolean"
  )
    return null;
  const key = id(value);
  if (!key) return null;
  return {
    id: key,
    provider: value.provider,
    amount: value.amount,
    status: value.status,
    paid: value.paid,
    ...(typeof value.currency === "string" ? { currency: value.currency } : {}),
  };
}
