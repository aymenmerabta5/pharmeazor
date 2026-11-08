"use client";
import { useAppForm } from "@/components/ui/form";
import type { RejectReasonProps } from "./types";

export function useRejectReason({ onSubmit, onOpenChange }: RejectReasonProps) {
  const form = useAppForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      const reason = value.reason.trim();
      if (!reason) return;
      onSubmit(reason);
      form.reset();
    },
  });
  return { form, submit: () => form.handleSubmit(), cancel: () => onOpenChange(false) };
}
