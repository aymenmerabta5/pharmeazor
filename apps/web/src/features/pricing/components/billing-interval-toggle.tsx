"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { PricingInterval } from "../model";

/** Monthly/yearly radio group. */
export function BillingIntervalToggle({
  interval,
  onSelect,
}: {
  interval: PricingInterval;
  onSelect(interval: PricingInterval): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  const options: { id: PricingInterval; label: string }[] = [
    { id: "monthly", label: t("monthly") },
    { id: "yearly", label: t("yearly") },
  ];
  return (
    <div className="ph-pricing-toggle" role="radiogroup" aria-label={t("eyebrow")}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={interval === option.id}
          className={`ph-pricing-toggle-btn ${interval === option.id ? "ph-pricing-toggle-active" : ""}`}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
