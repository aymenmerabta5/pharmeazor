"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ReceiptPreviewState } from "../types";

export function ManualReceiptView({ state }: { state: ReceiptPreviewState }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { preview, pending, failed, open, close } = state;
  return (
    <div className="flex flex-col items-start gap-3">
      {preview ? (
        <>
          {preview.image ? (
            <img
              src={preview.url}
              alt={t("manualReceiptPreview")}
              className="max-h-96 max-w-full rounded-lg object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("manualPdfHelp")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              render={<a href={preview.url} download={preview.name} />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              {t("manualDownload")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              {t("manualCloseReceipt")}
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={open}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? t("manualLoadingReceipt") : t("manualViewReceipt")}
        </Button>
      )}
      {failed ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t("manualReceiptFailed")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
