"use client";
import type * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { BILLING_TIERS, type BillingTier } from "@/lib/billing-catalog";
import { TIER_DESCRIPTIONS, TIER_NAMES, type PricingCopyKey } from "@/features/pricing/model";
import { useSurfaceTranslations } from "@/lib/translations";
import { landingCardRise, landingHover, landingStagger } from "../motion";

const PLAN_FEATURES: Readonly<Record<BillingTier, readonly PricingCopyKey[]>> = {
  basic: ["tierBasicFeature1", "tierBasicFeature2"],
  standard: ["tierStandardFeature1", "tierStandardFeature2"],
  pro: ["tierProFeature1", "tierProFeature2"],
};

/**
 * The plan strip.
 *
 * Prices live on the pricing page, where they are read from the billed
 * catalog. The landing page only names the three tiers and what each one is
 * for, so it can never advertise a price the checkout would refuse.
 */
export function LandingPlans(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const pricing = useSurfaceTranslations("pricing");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section
      id="plans"
      className="ph-landing-section ph-landing-plans"
      aria-labelledby="landing-plans-title"
    >
      <div className="ph-landing-wrap">
        <header className="ph-landing-section-head">
          <p className="ph-landing-eyebrow">{t("plansEyebrow")}</p>
          <h2 id="landing-plans-title" className="ph-landing-heading">
            {t("plansTitle")}
          </h2>
          <p className="ph-landing-lead">{t("plansDescription")}</p>
        </header>

        <motion.div
          className="ph-landing-plan-grid"
          variants={landingStagger}
          initial={enter}
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
        >
          {BILLING_TIERS.map((tier, index) => (
            <motion.article
              key={tier}
              className="ph-landing-plan"
              variants={landingCardRise}
              whileHover={reduced ? undefined : landingHover}
            >
              <span className="ph-landing-plan-index">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="ph-landing-plan-name">{pricing(TIER_NAMES[tier])}</h3>
              <p className="ph-landing-plan-description">{pricing(TIER_DESCRIPTIONS[tier])}</p>
              <ul className="ph-landing-plan-list">
                {PLAN_FEATURES[tier].map((feature) => (
                  <li key={feature}>
                    <Check className="size-4" aria-hidden />
                    {pricing(feature)}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>

        <div className="ph-landing-plans-actions">
          <Link href="/pricing" className="ph-landing-button ph-landing-button-primary">
            {t("plansCta")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="ph-landing-note">{t("plansNote")}</p>
        </div>
      </div>
    </section>
  );
}
