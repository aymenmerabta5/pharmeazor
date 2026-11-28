"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";

/**
 * The balance, first.
 *
 * A wallet customer needs the number they can spend before anything else, so
 * the amount is the largest element on the page and the two useful actions sit
 * beside it.
 */
export function BalanceHero({ balanceMinor }: { balanceMinor: number }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-card to-card p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -end-16 -top-24 size-64 rounded-full bg-primary/10 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Wallet className="size-3.5" aria-hidden />
            {t("balanceTitle")}
          </span>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatBillingPriceAmount(balanceMinor, "DZD", locale)}
          </p>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            {t("balanceDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="#topup" />} nativeButton={false}>
            {t("topUp")}
          </Button>
          <Button variant="outline" render={<Link href="/pricing" />} nativeButton={false}>
            {t("browsePlans")}
            <ArrowUpRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
