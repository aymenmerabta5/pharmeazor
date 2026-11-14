import * as React from "react";
import { PaymentLinkFormView } from "./components/payment-link-form";
import { usePaymentLinkForm } from "./use-payment-link-form";
import type { BillingAction } from "./mutations";
import { useTranslations } from "@/lib/i18n";
export function PaymentLinkSection({
  provider,
  disabled,
  submit,
  planId,
}: {
  provider: "chargily";
  disabled: boolean;
  submit(input: BillingAction): Promise<void>;
  planId: string;
}): React.JSX.Element {
  const t = useTranslations("billing");
  const form = usePaymentLinkForm(provider, submit, {
    defaultName: t("defaultLinkName"),
    required: t("paymentLinkRequired"),
    completed: t("paymentReceived"),
    planId,
  });
  return (
    <PaymentLinkFormView
      form={form}
      disabled={disabled}
      nameLabel={t("paymentLinkName")}
      planLabel={t("plan")}
      submitLabel={t("createPaymentLink")}
    />
  );
}
