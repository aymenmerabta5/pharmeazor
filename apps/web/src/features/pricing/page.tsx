"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { BillingIntervalToggle } from "./components/billing-interval-toggle";
import { PlanCard } from "./components/plan-card";
import { PricingHeader } from "./components/pricing-header";
import { usePricingPlans } from "./use-pricing-plans";

/** Pricing surface: plan cards with a billing-interval toggle. */
export function PricingPage(): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  const { interval, plans, selectInterval } = usePricingPlans();

  return (
    <div className="ph-surface">
      <PricingHeader />

      <main className="ph-pricing-main">
        <span className="ph-pricing-eyebrow">{t("eyebrow")}</span>
        <h1 className="ph-pricing-title">{t("title")}</h1>
        <p className="ph-pricing-description">{t("description")}</p>

        <BillingIntervalToggle interval={interval} onSelect={selectInterval} />

        <div className="ph-pricing-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </main>

      <footer className="ph-pricing-footer">
        <p>{t("disclaimer")}</p>
      </footer>
    </div>
  );
}
