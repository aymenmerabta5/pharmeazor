"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useSubmitManualPayment } from "./mutations";
import { createManualPaymentSchema } from "./schema";
import type { ManualPlan, ManualSummary } from "./model";

export function useManualPaymentForm(summary: ManualSummary, plans: ManualPlan[]) {
  const t = useSurfaceTranslations("billing");
  const mutation = useSubmitManualPayment();
  const captureOwner = useAuthOwnedEffect();
  const busy = React.useRef(false);
  const attempt = React.useRef<{ fingerprint: string; requestKey: string } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const defaultPlanId = plans[0]?.id ?? "";
  const form = useAppForm({
    defaultValues: {
      planId: defaultPlanId,
      method: summary.allowedMethods[0] ?? "",
      reference: "",
      receipt: null as File | null,
    },
    validators: {
      onSubmit: createManualPaymentSchema({
        receipt: t("manualReceiptInvalid"),
      }),
    },
    onSubmit: async ({ value }) => {
      if (busy.current || !summary.enabled) return;
      const plan = plans.find((entry) => entry.id === value.planId);
      const receipt = value.receipt;
      if (!plan || !receipt) return;
      const amountMinor = plan.priceMinor;
      const isCurrent = captureOwner();
      if (!isCurrent()) return;
      busy.current = true;
      const fingerprint = JSON.stringify([
        value.planId,
        amountMinor,
        value.method,
        value.reference.trim(),
        receipt.name,
        receipt.size,
        receipt.lastModified,
      ]);
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, requestKey: crypto.randomUUID() };
      try {
        const result = await mutation.submit({
          planId: value.planId,
          amountMinor,
          requestKey: attempt.current.requestKey,
          method: value.method,
          reference: value.reference.trim() || undefined,
          receipt,
        });
        if (result.status !== "success" || !isCurrent() || !result.isCurrent()) return;
        attempt.current = null;
        form.reset({
          planId: value.planId,
          method: value.method,
          reference: "",
          receipt: null,
        });
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
    plans,
    error: mutation.error ? t("manualSubmitFailed") : null,
    submitted: mutation.isSuccess,
  };
}
