"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useReviewManualPayment } from "./mutations";
import { createManualReviewSchema } from "./schema";

export function usePaymentReview(id: string) {
  const t = useSurfaceTranslations("billing");
  const mutation = useReviewManualPayment();
  const captureOwner = useAuthOwnedEffect();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null);
  const busy = React.useRef(false);
  const resolved =
    mutation.data?.status === "approved" || mutation.data?.status === "rejected"
      ? mutation.data.status
      : null;
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: createManualReviewSchema(decision, t("manualReasonRequired")) },
    onSubmit: async ({ value }) => {
      if (busy.current || !decision || resolved) return;
      const isCurrent = captureOwner();
      if (!isCurrent()) return;
      busy.current = true;
      try {
        await mutation.review({ id, decision, reason: value.reason.trim() || undefined });
      } catch {
        /* The mutation owns the error; the reason remains in the form. */
      } finally {
        busy.current = false;
      }
    },
  });
  function choose(value: "approved" | "rejected" | null): void {
    if (busy.current || resolved) return;
    mutation.reset();
    setDecision(value);
  }
  return {
    form,
    decision,
    resolved,
    choose,
    pending: mutation.isPending,
    error: mutation.error ? t("manualReviewFailed") : null,
  };
}
