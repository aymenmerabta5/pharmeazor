"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useSubmitManualPayment } from "./mutations";
import { createManualPaymentSchema } from "./schema";
import { manualAmountMinor, type ManualSummary } from "./model";

export function useManualPaymentForm(summary: ManualSummary) {
  const t = useSurfaceTranslations("billing");
  const mutation = useSubmitManualPayment();
  const captureOwner = useAuthOwnedEffect();
  const busy = React.useRef(false);
  const attempt = React.useRef<{ fingerprint: string; requestKey: string } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: {
      amount: "",
      method: summary.allowedMethods[0] ?? "",
      reference: "",
      receipt: null as File | null,
    },
    validators: {
      onSubmit: createManualPaymentSchema({
        amount: t("manualAmountInvalid"),
        receipt: t("manualReceiptInvalid"),
      }),
    },
    onSubmit: async ({ value }) => {
      if (busy.current || !summary.enabled) return;
      const amountMinor = manualAmountMinor(value.amount);
      if (amountMinor === null || !value.receipt) return;
      const isCurrent = captureOwner();
      if (!isCurrent()) return;
      busy.current = true;
      const fingerprint = JSON.stringify([
        amountMinor,
        value.method,
        value.reference.trim(),
        value.receipt.name,
        value.receipt.size,
        value.receipt.lastModified,
      ]);
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, requestKey: crypto.randomUUID() };
      try {
        const result = await mutation.submit({
          amountMinor,
          requestKey: attempt.current.requestKey,
          method: value.method,
          reference: value.reference.trim() || undefined,
          receipt: value.receipt,
        });
        if (result.status !== "success" || !isCurrent() || !result.isCurrent()) return;
        attempt.current = null;
        form.reset({ amount: "", method: value.method, reference: "", receipt: null });
        if (fileInput.current) fileInput.current.value = "";
      } catch {
        /* Mutation owns the error; keep the form and retry key. */
      } finally {
        busy.current = false;
      }
    },
  });
  return {
    form,
    fileInput,
    enabled: summary.enabled,
    receiverInstructions: summary.receiverInstructions,
    methods: summary.allowedMethods,
    error: mutation.error ? t("manualSubmitFailed") : null,
    submitted: mutation.isSuccess,
  };
}
