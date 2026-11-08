"use client";
import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { usePdfGenerator } from "./mutations";

import { samplePdfData, type PdfTemplate } from "./sample-data";
import { useTranslations } from "@/lib/i18n";
import { usePlatformI18n } from "@/lib/i18n";

export function usePdfWorkspace() {
  const t = useTranslations("pdf");
  const { locale } = usePlatformI18n();
  const form = useForm({
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

  const { generateAndShare, loading, error } = usePdfGenerator();
  async function download(template: PdfTemplate): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await generateAndShare({
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
