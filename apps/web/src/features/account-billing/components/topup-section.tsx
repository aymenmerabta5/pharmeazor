"use client";
import type * as React from "react";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualPaymentPanel } from "@/features/manual-payments/manual-payment-panel";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * The transfer form, anchorable from checkout.
 *
 * Checkout sends a short balance here, so the section owns the `topup` id and
 * keeps the heading beside the form rather than asking the customer to find it.
 */
export function TopupSection(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <Card id="topup" className="scroll-mt-24">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Landmark className="size-4" aria-hidden />
          </span>
          <CardTitle as="h2">{t("topupTitle")}</CardTitle>
        </div>
        <CardDescription className="max-w-[45ch]">{t("topupDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ManualPaymentPanel />
      </CardContent>
    </Card>
  );
}
