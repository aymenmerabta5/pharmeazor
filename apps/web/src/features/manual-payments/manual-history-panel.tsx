"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { ManualPaymentHistory } from "./components/payment-history";
import { ManualReceiptPreview } from "./receipt-preview";
import { useManualHistory } from "./queries";

/** The receipts the signed-in customer has submitted, with their decisions. */
export function ManualPaymentHistoryPanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const history = useManualHistory();
  if (!history.data && history.isPending)
    return <Skeleton className="h-24 w-full" aria-label={t("manualLoading")} />;
  if (history.error || !history.data)
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t("manualReadFailed")}</AlertDescription>
      </Alert>
    );
  return (
    <ManualPaymentHistory
      items={history.data.items}
      renderReceipt={(id) => <ManualReceiptPreview id={id} />}
    />
  );
}
