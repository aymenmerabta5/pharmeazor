"use client";
import type * as React from "react";
import { ReceiptText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualPaymentHistoryPanel } from "@/features/manual-payments/manual-history-panel";
import { useSurfaceTranslations } from "@/lib/translations";

/** Every receipt the customer submitted, with the decision it received. */
export function TopupHistory(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden />
          </span>
          <CardTitle as="h2">{t("historyTitle")}</CardTitle>
        </div>
        <CardDescription className="max-w-[65ch]">{t("historyDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ManualPaymentHistoryPanel />
      </CardContent>
    </Card>
  );
}
