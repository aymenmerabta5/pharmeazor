"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { ManualPaymentForm } from "./payment-form";
import { useManualSummary } from "./queries";

/**
 * The top-up form with its own instructions.
 *
 * The receiving account and the accepted methods are account-scoped and live
 * behind the authenticated RPC boundary, so the panel loads its own summary
 * instead of making every caller fetch it first.
 */
export function ManualPaymentPanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const summary = useManualSummary();
  if (!summary.data && summary.isPending)
    return <Skeleton className="h-48 w-full" aria-label={t("manualLoading")} />;
  if (summary.error || !summary.data)
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t("manualReadFailed")}</AlertDescription>
      </Alert>
    );
  return <ManualPaymentForm summary={summary.data} />;
}
