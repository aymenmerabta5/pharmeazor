"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, CreditCard } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

export function ActionsCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <section
      className="min-w-0 rounded-lg border bg-card p-6 shadow-surface lg:col-span-5"
      aria-labelledby="dashboard-actions-title"
    >
      <h2 id="dashboard-actions-title" className="mb-5 text-base font-semibold tracking-tight">
        {t("actions.title")}
      </h2>
      <div className="divide-y">
        <Link
          href="/settings"
          className="group flex min-h-20 items-center gap-3 rounded-lg py-4 text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ShieldCheck className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">{t("actions.security")}</span>
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-rotate-90"
            aria-hidden
          />
        </Link>
        <Link
          href="/billing"
          className="group flex min-h-20 items-center gap-3 rounded-lg py-4 text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CreditCard className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">{t("actions.manageBilling")}</span>
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-rotate-90"
            aria-hidden
          />
        </Link>
      </div>
    </section>
  );
}
