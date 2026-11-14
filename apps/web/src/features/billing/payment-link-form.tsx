"use client";
import type * as React from "react";
import { usePaymentLinkForm } from "./use-payment-link-form";
import { BillingPaymentLinkView } from "./components/payment-link-form";
import type { Plan } from "./model";

export function BillingPaymentLinkForm({
  allowed,
  plans,
}: {
  allowed: boolean;
  plans: Plan[];
}): React.JSX.Element {
  const state = usePaymentLinkForm(allowed, plans);
  return <BillingPaymentLinkView state={state} />;
}
