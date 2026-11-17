export const MANUAL_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const MANUAL_RECEIPT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type ManualReceiptMimeType = (typeof MANUAL_RECEIPT_TYPES)[number];
/** The smallest top-up the rail accepts: 100 DZD. */
export const MIN_TOPUP_MINOR = 10_000;
/** The largest top-up the rail accepts: 1,000,000 DZD. */
export const MAX_TOPUP_MINOR = 100_000_000;
/** Amounts worth offering with one tap, in DZD minor units. */
export const TOPUP_PRESETS = [200_000, 500_000, 1_000_000, 2_000_000] as const;
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
  /** Null for a wallet top-up; a legacy payment keeps the plan it bought. */
  planId: string | null;
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

/**
 * Read an amount the customer typed, in DZD.
 *
 * The field is free text because a transfer can be any amount; the only rule
 * is the rail's range. Returns minor units, or null when the text is not an
 * amount this rail can accept.
 */
export function manualAmountMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= MIN_TOPUP_MINOR && amount <= MAX_TOPUP_MINOR
    ? amount
    : null;
}
export function formatManualAmount(amountMinor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(
    amountMinor / 100,
  );
}
