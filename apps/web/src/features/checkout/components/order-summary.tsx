"use client";
import type * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { CheckoutOrder } from "../model";
import { tierNameKey } from "../model";

/** What the customer is buying: one plan, one period, one amount. */
export function CheckoutOrderSummary({ order }: { order: CheckoutOrder }): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  const tp = useSurfaceTranslations("pricing");
  const locale = useSurfaceLocale();
  const amountMinor = order.balance?.priceMinor ?? order.rails[0]?.amountMinor ?? null;
  const currency = order.balance ? "DZD" : (order.rails[0]?.currency ?? null);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-lg">
          {t("orderSummary")}
        </CardTitle>
        <CardDescription>{t("secureNote")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">{t("plan")}</span>
          <span className="font-medium">
            {tp(tierNameKey(order.tier))} · {order.interval === "year" ? t("yearly") : t("monthly")}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-4">
          <span className="text-muted-foreground">{t("total")}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {amountMinor !== null && currency
              ? formatBillingPriceAmount(amountMinor, currency, locale)
              : "—"}
          </span>
        </div>
        <Link
          href="/pricing"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("changePlan")}
        </Link>
      </CardContent>
    </Card>
  );
}
