import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import type { BillingAction } from "./mutations";
export function usePaymentLinkForm(
  provider: "chargily",
  submit: (input: BillingAction) => Promise<void>,
  copy: {
    defaultName: string;
    required: string;
    completed: string;
    planId: string;
  },
) {
  const form = useForm({
    defaultValues: { name: copy.defaultName, planId: copy.planId },
    validators: {
      onSubmit: ({ value }) =>
        value.name.trim() && value.planId.trim() ? undefined : copy.required,
    },
    onSubmit: async ({ value }) => {
      await submit({
        kind: "payment-link",
        provider,
        name: value.name.trim(),
        planId: value.planId.trim(),
        afterCompletionMessage: copy.completed,
      });
    },
  });
  // The default values of a form are only applied while it is untouched, so
  // a plan chosen after the name was typed would never reach the form.
  useEffect(() => {
    if (copy.planId) void form.setFieldValue("planId", copy.planId);
  }, [copy.planId, form]);
  return form;
}
export type PaymentLinkFormController = ReturnType<typeof usePaymentLinkForm>;
