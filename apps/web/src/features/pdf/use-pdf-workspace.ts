"use client";
import { useRef } from "react";
import { useAppForm, useStore } from "@/components/ui/form";
import { usePdfGenerator } from "./mutations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { samplePdfData, type PdfTemplate } from "./sample-data";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSurfaceLocale } from "@/lib/translations";

export function usePdfWorkspace() {
  const t = useSurfaceTranslations("pdf");
  const locale = useSurfaceLocale();
  const form = useAppForm({
    defaultValues: { template: "invoice" as PdfTemplate },
    onSubmit: async ({ value }): Promise<void> => {
      await download(value.template);
    },
  });
  const template = useStore(form.store, (state) => state.values.template);
  const setTemplate = (value: PdfTemplate): void => {
    form.setFieldValue("template", value);
  };
  const templateOptions = [
    { label: t("invoice"), value: "invoice" },
    { label: t("certificate"), value: "certificate" },
    { label: t("agreement"), value: "agreement" },
  ] as const;
  const inFlight = useRef(false);
  const captureOwner = useAuthOwnedEffect();
  const { generate, loading, error } = usePdfGenerator(captureOwner);
  async function download(template: PdfTemplate): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await generate({
        template,
        data: samplePdfData(template, t),
        locale,
        fileName: `${template}.pdf`,
      });
    } catch {
      /* The mutation adapter exposes errors; UI event promises must settle. */
    } finally {
      inFlight.current = false;
    }
  }
  return {
    template,
    setTemplate,
    templateOptions,
    loading,
    error,
    download: () => {
      void form.handleSubmit();
    },
  };
}
