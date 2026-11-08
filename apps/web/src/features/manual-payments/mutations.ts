"use client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpc, orpcClient } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, type QueryAuthScope } from "@/lib/query-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { manualReceiptAllowed } from "./receipt-utils";
import {
  MANUAL_RECEIPT_TYPES,
  type ManualReceipt,
  type ManualSubmitDraft,
  type ManualReviewInput,
} from "./model";

async function readManualReceipt(file: File): Promise<ManualReceipt> {
  const mimeType = MANUAL_RECEIPT_TYPES.find((candidate) => candidate === file.type);
  if (!manualReceiptAllowed(file) || !mimeType) throw new Error("MANUAL_RECEIPT_INVALID");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("MANUAL_RECEIPT_READ_FAILED"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
        : reject(new Error("MANUAL_RECEIPT_READ_FAILED"));
    reader.readAsDataURL(file);
  });
  return { base64, mimeType, originalName: file.name };
}
async function refreshManualQueries(
  queryClient: QueryClient,
  scope: QueryAuthScope | null,
  isCurrent: () => boolean,
): Promise<void> {
  if (!scope || !isCurrent()) return;
  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: authScopedQueryKey(scope, orpc.billing.manual.summary.key({ type: "query" })),
    }),
    queryClient.invalidateQueries({
      queryKey: authScopedQueryKey(scope, orpc.billing.manual.list.key({ type: "query" })),
    }),
    queryClient.invalidateQueries({
      queryKey: authScopedQueryKey(scope, orpc.billing.manual.reviewQueue.key({ type: "query" })),
    }),
  ]);
}
export function useSubmitManualPayment() {
  const queryClient = useQueryClient();
  const mutation = useAuthOwnedMutation(
    async (draft: ManualSubmitDraft, isCurrent: () => boolean) => {
      const scope = currentQueryAuthScope(queryClient);
      const receipt = await readManualReceipt(draft.receipt);
      if (!isCurrent()) throw new Error("Payment request owner changed");
      const result = await orpcClient.billing.manual.submit({ ...draft, receipt });
      void refreshManualQueries(queryClient, scope, isCurrent);
      return result;
    },
  );
  return {
    submit: mutation.run,
    error: mutation.error,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}
export function useReviewManualPayment() {
  const queryClient = useQueryClient();
  const mutation = useAuthOwnedMutation(
    async (input: ManualReviewInput, isCurrent: () => boolean) => {
      const scope = currentQueryAuthScope(queryClient);
      const result = await orpcClient.billing.manual.review(input);
      void refreshManualQueries(queryClient, scope, isCurrent);
      return result;
    },
  );
  return {
    review: mutation.run,
    data: mutation.data,
    error: mutation.error,
    isPending: mutation.isPending,
    reset: mutation.reset,
  };
}
