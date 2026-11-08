import { z } from "zod";
import { manualAmountMinor } from "./model";
import { manualReceiptAllowed } from "./receipt-utils";

export function createManualPaymentSchema(messages: { amount: string; receipt: string }) {
  return z.object({
    amount: z.string().refine((value) => manualAmountMinor(value) !== null, messages.amount),
    method: z.string().min(1),
    reference: z.string().trim().max(160),
    receipt: z.custom<File | null>(
      (value) =>
        typeof File !== "undefined" && value instanceof File && manualReceiptAllowed(value),
      messages.receipt,
    ),
  });
}
export function createManualReviewSchema(
  decision: "approved" | "rejected" | null,
  reasonRequired: string,
) {
  return z.object({
    reason: z
      .string()
      .trim()
      .max(500)
      .refine((value) => decision !== "rejected" || value.length > 0, reasonRequired),
  });
}
