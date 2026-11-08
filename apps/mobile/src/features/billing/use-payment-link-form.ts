import { useForm } from "@tanstack/react-form";
import type { ProviderName } from "./model";
import type { BillingAction } from "./mutations";
export function usePaymentLinkForm(
  provider: ProviderName,
  submit: (input: BillingAction) => Promise<void>,
  copy: { defaultName: string; required: string; completed: string },
) {
  return useForm({
    defaultValues: { name: copy.defaultName, price: "" },
    validators: {
      onSubmit: ({ value }) =>
        value.name.trim() && value.price.trim() ? undefined : copy.required,
    },
    onSubmit: async ({ value }) => {
      await submit({
        kind: "payment-link",
        provider,
        name: value.name.trim(),
        price: value.price.trim(),
        afterCompletionMessage: copy.completed,
      });
    },
  });
}
export type PaymentLinkFormController = ReturnType<typeof usePaymentLinkForm>;
