"use client";
import { useAppForm } from "@/components/ui/form";
import type { NameConfirmationProps } from "./types";

export function useNameConfirmation({ expectedName, onConfirm }: NameConfirmationProps) {
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      if (value.name.trim() !== expectedName) return;
      onConfirm();
      form.reset();
    },
  });
  return { form, confirm: () => form.handleSubmit(), cancel: () => form.reset() };
}
