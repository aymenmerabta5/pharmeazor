export const MANUAL_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const MANUAL_RECEIPT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type ManualReceiptMimeType = (typeof MANUAL_RECEIPT_TYPES)[number];
/**
 * A plan the manual rail can sell.
 *
 * The manual rail settles in DZD, so a plan carries the price the customer
 * has to transfer.
 */
export interface ManualPlan {
  id: string;
  name: string;
  /** Price in the minor units of `currency`. */
  priceMinor: number;
  currency: "DZD";
}
export interface ManualSummary {
  enabled: boolean;
  currency: "DZD";
  balanceMinor: number;
  receiverInstructions: string;
  allowedMethods: readonly string[];
  canReview: boolean;
}
export interface ManualPayment {
  id: string;
  ownerId: string;
  planId: string;
  amountMinor: number;
  currency: "DZD";
  status: "pending" | "approved" | "rejected";
  method: string;
  reference: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
  reason: string | null;
}
export interface ManualReceipt {
  base64: string;
  mimeType: ManualReceiptMimeType;
  originalName: string;
}
export interface ManualSubmitDraft {
  planId: string;
  amountMinor: number;
  requestKey: string;
  method: string;
  reference?: string;
  receipt: File;
}
export interface ManualReviewInput {
  id: string;
  decision: "approved" | "rejected";
  reason?: string;
}

export function manualAmountMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= 100_000_000 ? amount : null;
}
export function formatManualAmount(amountMinor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(
    amountMinor / 100,
  );
}

/**
 * The plans the manual rail can sell.
 *
 * The catalog carries a price per rail. The manual rail settles in DZD, so
 * only the manual price of a plan is offered here.
 */
export function toManualPlans(value: unknown): ManualPlan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const name = typeof record.name === "string" ? record.name : null;
    if (!id || !name) return [];
    const prices = Array.isArray(record.prices) ? record.prices : [];
    const price = prices.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as Record<string, unknown>).provider === "manual",
    ) as Record<string, unknown> | undefined;
    const amountMinor = price?.amountMinor;
    if (!price || typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor)) return [];
    return [{ id, name, priceMinor: amountMinor, currency: "DZD" as const }];
  });
}
