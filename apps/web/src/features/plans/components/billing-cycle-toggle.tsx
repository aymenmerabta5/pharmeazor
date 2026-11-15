"use client";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { useSurfaceTranslations } from "@/lib/translations";
import type { BillingCycle } from "../model";

export function BillingCycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange(cycle: BillingCycle): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("plans");
  return (
    <div
      role="group"
      aria-label={t("eyebrow")}
      className="inline-flex rounded-full border border-border/60 bg-muted p-1"
    >
      {(["monthly", "yearly"] as const).map((option) => {
        const selected = cycle === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-9 rounded-full px-5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "bg-card text-foreground shadow-control"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(option)}
          </button>
        );
      })}
    </div>
  );
}
