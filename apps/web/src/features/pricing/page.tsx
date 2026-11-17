"use client";
import type * as React from "react";
import { useAppShell } from "@/features/app-shell/use-app-shell";
import type { BillingPlan } from "@/lib/billing-catalog";
import { useSurfaceTranslations } from "@/lib/translations";
import { BillingIntervalToggle } from "./components/billing-interval-toggle";
import { PlanCard } from "./components/plan-card";
import { PricingHeader } from "./components/pricing-header";
import { usePricingPlans } from "./use-pricing-plans";

/** Pricing surface: the billed tiers with a monthly/yearly toggle. */
export function PricingPage({
  plans,
  signedIn,
  currentPlanIds,
}: {
  plans: readonly BillingPlan[];
  signedIn: boolean;
  currentPlanIds: readonly string[];
}): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  const shell = useAppShell();
  const { interval, cards, selectInterval } = usePricingPlans({
    plans,
    signedIn,
    currentPlanIds,
  });

  return (
    <div className="ph-surface">
      <PricingHeader
        identity={shell.identity}
        onNavigate={shell.onNavigate}
        onSignOut={shell.onSignOut}
      />

      <main className="ph-pricing-main">
        <span className="ph-pricing-eyebrow">{t("eyebrow")}</span>
        <h1 className="ph-pricing-title">{t("title")}</h1>
        <p className="ph-pricing-description">{t("description")}</p>

        <BillingIntervalToggle interval={interval} onSelect={selectInterval} />
        <p className="ph-pricing-note">
          {interval === "yearly" ? t("yearlyNote") : t("monthlyNote")}
        </p>

        <div className="ph-pricing-grid">
          {cards.map((plan) => (
            <PlanCard key={plan.tier} plan={plan} />
          ))}
        </div>
      </main>

      <footer className="ph-pricing-footer">
        <p>{t("disclaimer")}</p>
      </footer>
    </div>
  );
}
