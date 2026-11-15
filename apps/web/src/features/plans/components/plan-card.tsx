"use client";
import type * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { cn } from "@/lib/utils";
import type { BillingCycle, PlanDefinition } from "../model";

export function PlanCard({
  plan,
  cycle,
  currentPlanId,
}: {
  plan: PlanDefinition;
  cycle: BillingCycle;
  currentPlanId: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("plans");
  const locale = useSurfaceLocale();
  const price = cycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
  const formatted =
    price === null
      ? t("customPrice")
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(price) +
        " " +
        t("currency");
  const featured = plan.featured === true;
  const muted = featured ? "text-primary-foreground/75" : "text-muted-foreground";
  const feature = featured ? "text-primary-foreground" : "text-foreground/85";
  const check = featured ? "text-primary-foreground/75" : "text-primary";
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border p-6 sm:p-7 lg:min-h-[500px]",
        featured
          ? "border-primary bg-primary text-primary-foreground shadow-surface"
          : "border-border/80 bg-card text-card-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{t(plan.nameKey)}</h2>
          <p className={cn("mt-1 text-sm leading-5", muted)}>{t(plan.audienceKey)}</p>
        </div>
        {featured ? (
          <span className="shrink-0 rounded-full bg-[#f4e6db] px-3 py-1 text-[0.6875rem] font-semibold text-[#4c3a2b]">
            {t("mostPopular")}
          </span>
        ) : null}
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-2">
        <span className="text-[2.5rem] font-bold leading-none tracking-[-0.03em] sm:text-[2.7rem]">
          {formatted}
        </span>
        {price === null ? null : (
          <span className={cn("text-sm", muted)}>
            {t(cycle === "monthly" ? "perMonth" : "perYear")}
          </span>
        )}
      </p>
      <div className="mt-5">
        {plan.id === currentPlanId ? (
          <Button
            type="button"
            variant={featured ? "ghost" : "outline"}
            disabled
            className={cn(
              "h-11 w-full rounded-xl text-sm font-semibold disabled:opacity-100",
              featured &&
                "border border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-transparent",
            )}
          >
            {t("currentPlan")}
          </Button>
        ) : plan.id === "pro" ? (
          <Button
            className="h-11 w-full rounded-xl border-0 bg-card text-sm font-semibold text-primary shadow-none hover:bg-card/90"
            render={<Link href="/billing" />}
            nativeButton={false}
          >
            {t("upgradeToPro")}
          </Button>
        ) : plan.id === "pharmacy" ? (
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl text-sm font-semibold"
            render={<Link href="/billing" />}
            nativeButton={false}
          >
            {t("contactUs")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled
            className="h-11 w-full rounded-xl text-sm font-semibold disabled:opacity-100"
          >
            {t("included")}
          </Button>
        )}
      </div>
      <ul className="mt-6 flex flex-col gap-3.5">
        {plan.featureKeys.map((key) => (
          <li key={key} className="flex items-start gap-3">
            <Check className={cn("mt-1 size-4 shrink-0", check)} aria-hidden />
            <span className={cn("text-sm leading-6", feature)}>{t(key)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
