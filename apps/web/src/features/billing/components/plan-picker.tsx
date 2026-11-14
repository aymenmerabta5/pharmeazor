"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { useSurfaceTranslations } from "@/lib/translations";
import { formatBillingPriceAmount } from "@/lib/billing-money";
import type { CheckoutProviderName, Plan } from "../model";

/**
 * The plan picker.
 *
 * Each rail prices the same plans differently, so the picker shows the price
 * of the rail the customer is about to pay with. Picking a plan here is what
 * decides which subscription the payment buys.
 */
export function BillingPlanPicker({
  plans,
  provider,
  selectedPlanId,
  onSelect,
  disabled,
}: {
  plans: Plan[];
  provider: CheckoutProviderName;
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  disabled?: boolean;
}): React.JSX.Element | null {
  const t = useSurfaceTranslations("billing");
  const available = plans.filter((plan) =>
    plan.prices.some((price) => price.provider === provider),
  );
  if (available.length === 0) return null;
  return (
    <fieldset
      className="flex flex-col gap-3"
      aria-label={t("choosePlan")}
      data-testid="billing-plan-picker"
    >
      <legend className="text-sm font-medium">{t("choosePlan")}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((plan) => {
          const price = plan.prices.find((entry) => entry.provider === provider);
          const selected = plan.id === selectedPlanId;
          return (
            <label
              key={plan.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                selected ? "border-primary bg-primary/[0.04]" : "border-border"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing-plan"
                  value={plan.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onSelect(plan.id)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm font-medium">{plan.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {price
                  ? `${formatBillingPriceAmount(price.amountMinor, price.currency)} ${t("perMonth")}`
                  : "—"}
              </span>
              {plan.description ? (
                <span className="text-xs text-muted-foreground">{plan.description}</span>
              ) : null}
            </label>
          );
        })}
      </div>
      {selectedPlanId ? (
        <Badge variant="secondary" className="w-fit">
          {t("plan")}:{" "}
          {available.find((plan) => plan.id === selectedPlanId)?.name ?? selectedPlanId}
        </Badge>
      ) : null}
    </fieldset>
  );
}
