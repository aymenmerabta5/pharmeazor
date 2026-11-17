"use client";
import type * as React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { CheckoutRailOption } from "../model";
import type { CheckoutRail } from "@/lib/billing-catalog";

/** A hosted card checkout, one row per provisioned rail. */
export function CheckoutRailOptions({
  rails,
  pendingRail,
  onStart,
}: {
  rails: readonly CheckoutRailOption[];
  pendingRail: CheckoutRail | "balance" | null;
  onStart(rail: CheckoutRail): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  const locale = useSurfaceLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          {t("payWithCard")}
        </CardTitle>
        <CardDescription>{t("payWithCardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rails.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm leading-6 text-muted-foreground">
            {t("cardUnavailable")}
          </p>
        ) : (
          rails.map((option) => (
            <div
              key={option.rail}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <CreditCard className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {option.rail === "stripe" ? t("railStripe") : t("railChargily")}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatBillingPriceAmount(option.amountMinor, option.currency, locale)}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => onStart(option.rail)}
                disabled={pendingRail !== null}
              >
                {pendingRail === option.rail ? t("starting") : t("continue")}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
