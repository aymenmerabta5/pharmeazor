"use client";
import type * as React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { CheckoutBalanceOption } from "../model";

/**
 * Paying with credit the customer already holds.
 *
 * A short balance is not a wall: it shows the exact amount still missing and
 * sends the customer to the top-up form, so the path forward is one click.
 */
export function CheckoutBalanceOption({
  balance,
  pending,
  onPay,
}: {
  balance: CheckoutBalanceOption;
  pending: boolean;
  onPay(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  const locale = useSurfaceLocale();
  const money = (amountMinor: number): string =>
    formatBillingPriceAmount(amountMinor, balance.currency, locale);
  return (
    <Card className="border-primary/30 bg-primary/[0.035]">
      <CardHeader className="gap-3 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Wallet className="size-4" aria-hidden />
            </span>
            <CardTitle as="h2" className="text-base">
              {t("payWithBalance")}
            </CardTitle>
          </div>
          <Badge variant={balance.canPay ? "default" : "outline"}>
            {balance.canPay ? t("balanceCovered") : t("balanceNeedsTopup")}
          </Badge>
        </div>
        <CardDescription>{t("balanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4 rounded-lg border border-border/70 bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("balanceLabel")}</span>
          <span className="text-xl font-semibold tabular-nums">{money(balance.balanceMinor)}</span>
        </div>
        {balance.canPay ? (
          <div className="flex flex-col gap-2">
            <Button onClick={onPay} disabled={pending} className="w-full sm:w-auto">
              {pending
                ? t("payingWithBalance")
                : t("payWithBalanceAction", { amount: money(balance.priceMinor) })}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("balanceAfter", { amount: money(balance.balanceMinor - balance.priceMinor) })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3">
            <p className="text-sm leading-6">
              {t("balanceShort", { amount: money(balance.shortfallMinor) })}
            </p>
            <Button variant="outline" render={<Link href="/settings/billing#topup" />}>
              {t("topUpBalance")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
