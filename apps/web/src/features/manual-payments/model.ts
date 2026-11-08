export const MANUAL_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const MANUAL_RECEIPT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type ManualReceiptMimeType = (typeof MANUAL_RECEIPT_TYPES)[number];
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
