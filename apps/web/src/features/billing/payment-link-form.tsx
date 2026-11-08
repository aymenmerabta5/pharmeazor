"use client";
import type * as React from "react";
import { usePaymentLinkForm } from "./use-payment-link-form";
import { BillingPaymentLinkView } from "./components/payment-link-form";

export function BillingPaymentLinkForm({ allowed }: { allowed: boolean }): React.JSX.Element {
  const state = usePaymentLinkForm(allowed);
  return <BillingPaymentLinkView state={state} />;
}
