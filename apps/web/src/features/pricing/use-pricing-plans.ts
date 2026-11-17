"use client";
import * as React from "react";
import {
  billingTierOf,
  billingTierOfferings,
  headlinePrice,
  type BillingPlan,
} from "@/lib/billing-catalog";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import {
  TIER_DESCRIPTIONS,
  TIER_FEATURES,
  TIER_NAMES,
  type PricingCard,
  type PricingInterval,
} from "./model";

/**
 * Pricing workflow.
 *
 * The page reads the same catalog the checkout charges from, so a card can
 * never advertise a plan or a price the checkout would then refuse. The
 * interval only selects which row of a tier is shown; the tier itself owns the
 * copy.
 */
export function usePricingPlans({
  plans,
  signedIn,
  currentPlanIds,
}: {
  plans: readonly BillingPlan[];
  signedIn: boolean;
  currentPlanIds: readonly string[];
}) {
  const t = useSurfaceTranslations("pricing");
  const locale = useSurfaceLocale();
  const [interval, setInterval] = React.useState<PricingInterval>("monthly");

  const cards: PricingCard[] = billingTierOfferings(plans).map((offering) => {
    const plan = interval === "yearly" ? offering.yearly : offering.monthly;
    const price = plan ? headlinePrice(plan) : null;
    const current = signedIn && currentPlanIds.some((id) => billingTierOf(id) === offering.tier);
    const href = !plan
      ? null
      : current
        ? "/settings/billing"
        : signedIn
          ? `/checkout?plan=${encodeURIComponent(plan.id)}`
          : "/sign-up";
    return {
      tier: offering.tier,
      planId: plan?.id ?? null,
      name: t(TIER_NAMES[offering.tier]),
      description: t(TIER_DESCRIPTIONS[offering.tier]),
      price: price ? formatBillingPriceAmount(price.amountMinor, price.currency, locale) : "",
      period: plan ? (interval === "yearly" ? t("perYear") : t("perMonth")) : "",
      features: TIER_FEATURES[offering.tier].map((key) => ({ key, label: t(key) })),
      cta: current
        ? t("currentPlan")
        : !plan
          ? t("unavailable")
          : signedIn
            ? t("choosePlan")
            : t("createAccount"),
      href,
      popular: offering.tier === "standard",
      current,
    };
  });

  return { interval, cards, selectInterval: setInterval };
}
