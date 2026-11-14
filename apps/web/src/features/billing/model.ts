export type ProviderName = "stripe" | "chargily" | "manual";
/** The rails that can start a hosted checkout. Manual settles by transfer. */
export type CheckoutProviderName = "stripe" | "chargily";
export type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused"
  | string;
export interface PlanPrice {
  provider: ProviderName;
  /** Price in the minor units of `currency`. */
  amountMinor: number;
  currency: string;
}
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  tier: number;
  interval: string;
  intervalCount: number;
  prices: PlanPrice[];
}
export interface Sub {
  id: string;
  provider: ProviderName;
  providerSubscriptionId: string;
  /** The plan this subscription grants. */
  planId: string;
  status: SubStatus;
  currentPeriodStart?: string | Date | null;
  /** The expiry of the covered window. */
  currentPeriodEnd?: string | Date | null;
  /** True only when the rail charges again without a new authorization. */
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface Inv {
  id: string;
  provider: ProviderName;
  amount: number;
  currency?: string;
  status: string;
  paid: boolean;
  hostedUrl?: string | null;
}
export interface LicenseKey {
  id: string;
  provider: ProviderName;
  key: string;
  status: string;
}
export interface UsageEvent {
  id: string;
  provider: ProviderName;
  name: string;
  credits?: number;
  externalId?: string;
  createdAt?: string | Date;
}
export interface BillingInitialData {
  subscriptions: unknown[];
  invoices: unknown[];
  licenseKeys: unknown[];
  usageEvents: unknown[];
  plans: unknown[];
  canCreatePaymentLinks?: boolean;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordId(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
}
function providerName(value: unknown): ProviderName | null {
  return value === "stripe" || value === "chargily" || value === "manual" ? value : null;
}
function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}
function nullableDate(value: unknown): string | Date | null | undefined {
  return value === null || typeof value === "string" || value instanceof Date ? value : undefined;
}
function toPlanPrice(value: unknown): PlanPrice | null {
  if (!isRecord(value)) return null;
  const provider = providerName(value.provider);
  if (
    !provider ||
    typeof value.amountMinor !== "number" ||
    !Number.isSafeInteger(value.amountMinor) ||
    typeof value.currency !== "string"
  )
    return null;
  return { provider, amountMinor: value.amountMinor, currency: value.currency };
}
function toPlan(value: unknown): Plan | null {
  if (!isRecord(value)) return null;
  const id = recordId(value);
  if (!id || typeof value.name !== "string") return null;
  const prices = Array.isArray(value.prices)
    ? value.prices.flatMap((price) => {
        const parsed = toPlanPrice(price);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    id,
    name: value.name,
    description: nullableString(value.description) ?? null,
    tier: typeof value.tier === "number" ? value.tier : 0,
    interval: typeof value.interval === "string" ? value.interval : "month",
    intervalCount:
      typeof value.intervalCount === "number" && value.intervalCount > 0 ? value.intervalCount : 1,
    prices,
  };
}
function toSubscription(value: unknown): Sub | null {
  if (!isRecord(value)) return null;
  const id = recordId(value);
  const provider = providerName(value.provider);
  if (
    !id ||
    !provider ||
    typeof value.providerSubscriptionId !== "string" ||
    typeof value.status !== "string"
  )
    return null;
  const currentPeriodEnd = nullableDate(value.currentPeriodEnd);
  return {
    id,
    provider,
    providerSubscriptionId: value.providerSubscriptionId,
    planId: typeof value.planId === "string" ? value.planId : "",
    status: value.status,
    currentPeriodStart: nullableDate(value.currentPeriodStart),
    currentPeriodEnd,
    autoRenew: value.autoRenew === true,
    cancelAtPeriodEnd: value.cancelAtPeriodEnd === true,
    customerId: nullableString(value.customerId),
    metadata: value.metadata === null || isRecord(value.metadata) ? value.metadata : undefined,
  };
}

/**
 * The status a subscription shows.
 *
 * The server decides it: a live subscription whose period has run out is
 * expired, whatever the stored status still says.
 */
export function effectiveStatus(status: string, periodEnd: string | Date | null | undefined) {
  if (status !== "active" && status !== "trialing" && status !== "on_trial") return status;
  const end = periodEnd instanceof Date ? periodEnd : periodEnd ? new Date(periodEnd) : null;
  return end && end.getTime() > Date.now() ? status : "expired";
}
function toInvoice(value: unknown): Inv | null {
  if (!isRecord(value)) return null;
  const id = recordId(value);
  const provider = providerName(value.provider);
  if (!id || !provider || typeof value.amount !== "number" || typeof value.status !== "string")
    return null;
  return {
    id,
    provider,
    amount: value.amount,
    currency: typeof value.currency === "string" ? value.currency : undefined,
    status: value.status,
    paid: value.paid === true,
    hostedUrl: nullableString(value.hostedUrl ?? value.url),
  };
}
function toLicenseKey(value: unknown): LicenseKey | null {
  if (!isRecord(value)) return null;
  const id = recordId(value);
  const provider = providerName(value.provider);
  return id && provider && typeof value.key === "string" && typeof value.status === "string"
    ? { id, provider, key: value.key, status: value.status }
    : null;
}
function toUsageEvent(value: unknown): UsageEvent | null {
  if (!isRecord(value)) return null;
  const id = recordId(value);
  const provider = providerName(value.provider);
  if (!id || !provider || typeof value.name !== "string") return null;
  return {
    id,
    provider,
    name: value.name,
    credits: typeof value.credits === "number" ? value.credits : undefined,
    externalId: typeof value.externalId === "string" ? value.externalId : undefined,
    createdAt:
      typeof value.createdAt === "string" || value.createdAt instanceof Date
        ? value.createdAt
        : undefined,
  };
}

export function normalizeBillingSnapshot(initialData: BillingInitialData | null) {
  const subscriptions = (initialData?.subscriptions ?? []).flatMap((value) => {
    const item = toSubscription(value);
    return item ? [item] : [];
  });
  const invoices = (initialData?.invoices ?? []).flatMap((value) => {
    const item = toInvoice(value);
    return item ? [item] : [];
  });
  const usageEvents = (initialData?.usageEvents ?? []).flatMap((value) => {
    const item = toUsageEvent(value);
    return item ? [item] : [];
  });
  const licenseKey =
    (initialData?.licenseKeys ?? [])
      .map(toLicenseKey)
      .find((value): value is LicenseKey => value !== null) ?? null;
  const plans = (initialData?.plans ?? []).flatMap((value) => {
    const item = toPlan(value);
    return item ? [item] : [];
  });
  return { subscriptions, invoices, usageEvents, licenseKey, plans };
}
