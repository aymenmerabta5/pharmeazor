"use client";
import type * as React from "react";
import type { ManualPlan, ManualSummary } from "./model";
import { useManualPaymentForm } from "./use-manual-payment-form";
import { ManualPaymentFormView } from "./components/payment-form";

export function ManualPaymentForm({
  summary,
  plans,
}: {
  summary: ManualSummary;
  plans: ManualPlan[];
}): React.JSX.Element {
  const state = useManualPaymentForm(summary, plans);
  return <ManualPaymentFormView state={state} />;
}
