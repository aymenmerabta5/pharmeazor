"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { createPaymentLinkSchema } from "./schema";
import { useBillingPaymentLinkMutation } from "./mutations";

export function usePaymentLinkForm(allowed: boolean) {
  const t = useSurfaceTranslations("billing");
  const mutation = useBillingPaymentLinkMutation();
  const busy = React.useRef(false);
  const form = useAppForm({
    defaultValues: { name: "", price: "" },
    validators: { onSubmit: createPaymentLinkSchema(t("paymentLinkRequired")) },
    onSubmit: async ({ value }) => {
      if (!allowed || busy.current) return;
      busy.current = true;
      try {
        await mutation.run({
          provider: "chargily",
          name: value.name.trim(),
          price: value.price.trim(),
        });
      } finally {
        busy.current = false;
      }
    },
  });
  return {
    form,
    allowed,
    error: mutation.error ? t("paymentLinkError") : null,
    url: mutation.data?.url ?? null,
  };
}
