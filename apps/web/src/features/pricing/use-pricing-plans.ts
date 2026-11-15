"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { BillingInterval, Plan } from "./model";

/**
 * Pricing workflow: the selected billing interval and the plan cards rendered
 * from the `pricing` translation surface.
 */
export function usePricingPlans() {
  const t = useSurfaceTranslations("pricing");
  const [interval, setBillingInterval] = React.useState<BillingInterval>("monthly");

  const plans: Plan[] = [
    {
      id: "free",
      name: t("plans.free.name"),
      description: t("plans.free.description"),
      price: t("plans.free.price"),
      cta: t("currentPlan"),
      features: [
        { key: "citations", label: t("plans.free.features.citations") },
        { key: "dailyLimit", label: t("plans.free.features.dailyLimit") },
        { key: "sources", label: t("plans.free.features.sources") },
        { key: "scope", label: t("plans.free.features.scope") },
      ],
    },
    {
      id: "pro",
      name: t("plans.pro.name"),
      description: t("plans.pro.description"),
      price: t("plans.pro.price"),
      cta: t("upgradeToPro"),
      popular: true,
      features: [
        { key: "unlimited", label: t("plans.pro.features.unlimited") },
        { key: "crossSource", label: t("plans.pro.features.crossSource") },
        { key: "disagreement", label: t("plans.pro.features.disagreement") },
        { key: "prescription", label: t("plans.pro.features.prescription") },
        { key: "export", label: t("plans.pro.features.export") },
      ],
    },
    {
      id: "pharmacy",
      name: t("plans.pharmacy.name"),
      description: t("plans.pharmacy.description"),
      price: t("plans.pharmacy.price"),
      cta: t("contactUs"),
      features: [
        { key: "everything", label: t("plans.pharmacy.features.everything") },
        { key: "seats", label: t("plans.pharmacy.features.seats") },
        { key: "noticeTracking", label: t("plans.pharmacy.features.noticeTracking") },
        { key: "support", label: t("plans.pharmacy.features.support") },
      ],
    },
  ];

  const selectInterval = React.useCallback((next: BillingInterval) => {
    setBillingInterval(next);
  }, []);

  return { interval, plans, selectInterval };
}
