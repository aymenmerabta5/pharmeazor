"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { createPaymentLinkSchema } from "./schema";
import { useBillingPaymentLinkMutation } from "./mutations";
import type { Plan } from "./model";

export function usePaymentLinkForm(allowed: boolean, plans: Plan[]) {
  const t = useSurfaceTranslations("billing");
  const mutation = useBillingPaymentLinkMutation();
  const busy = React.useRef(false);
  const form = useAppForm({
    defaultValues: { name: "", planId: "" },
    validators: { onSubmit: createPaymentLinkSchema(t("paymentLinkRequired")) },
    onSubmit: async ({ value }) => {
      if (!allowed || busy.current) return;
      busy.current = true;
      try {
        await mutation.run({
          provider: "chargily",
          name: value.name.trim(),
          planId: value.planId,
        });
      } finally {
        busy.current = false;
      }
    },
  });
  return {
    form,
    allowed,
    plans,
    error: mutation.error ? t("paymentLinkError") : null,
    url: mutation.data?.url ?? null,
  };
}
