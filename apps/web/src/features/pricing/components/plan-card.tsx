"use client";
import type * as React from "react";
import { Check } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { Plan } from "../model";

/** One plan card. */
export function PlanCard({ plan }: { plan: Plan }): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  return (
    <article className={`ph-plan-card ${plan.popular ? "ph-plan-popular" : ""}`}>
      <div className="ph-plan-header">
        <div className="ph-plan-name-row">
          <h2 className="ph-plan-name">{plan.name}</h2>
          {plan.popular ? <span className="ph-plan-badge">{t("mostPopular")}</span> : null}
        </div>
        <p className="ph-plan-description">{plan.description}</p>
        <p className="ph-plan-price">
          <span className="ph-plan-price-amount">{plan.price}</span>
          {plan.id === "pharmacy" ? null : (
            <span className="ph-plan-price-period"> {t("perMonth")}</span>
          )}
        </p>
      </div>

      <button type="button" className={`ph-plan-cta ${plan.popular ? "ph-plan-cta-primary" : ""}`}>
        {plan.cta}
      </button>

      <ul className="ph-plan-features" role="list">
        {plan.features.map((feature) => (
          <li key={feature.key} className="ph-plan-feature">
            <Check className="ph-plan-check" aria-hidden />
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
