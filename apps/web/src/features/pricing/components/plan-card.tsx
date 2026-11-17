"use client";
import type * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { cn } from "@/lib/utils";
import type { PricingCard } from "../model";

/** One plan card, priced from the catalog the checkout charges from. */
export function PlanCard({ plan }: { plan: PricingCard }): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  const cta = cn("ph-plan-cta", plan.popular && !plan.current && "ph-plan-cta-primary");
  return (
    <article className={cn("ph-plan-card", plan.popular && "ph-plan-popular")}>
      <div className="ph-plan-header">
        <div className="ph-plan-name-row">
          <h2 className="ph-plan-name">{plan.name}</h2>
          {plan.current ? (
            <span className="ph-plan-badge">{t("currentPlan")}</span>
          ) : plan.popular ? (
            <span className="ph-plan-badge">{t("mostPopular")}</span>
          ) : null}
        </div>
        <p className="ph-plan-description">{plan.description}</p>
        <p className="ph-plan-price">
          <span className="ph-plan-price-amount">{plan.price}</span>
          {plan.period ? <span className="ph-plan-price-period"> {plan.period}</span> : null}
        </p>
      </div>

      {plan.href ? (
        <Link href={plan.href} className={cta}>
          {plan.cta}
        </Link>
      ) : (
        <span className={cn(cta, "ph-plan-cta-disabled")} aria-disabled="true">
          {plan.cta}
        </span>
      )}

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
