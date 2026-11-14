import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { CheckoutProviderName, PlanView } from "../model";

/**
 * The plan picker.
 *
 * Each rail prices the same plans differently, so the picker shows the price
 * of the rail the customer is about to pay with.
 */
export function PlanPicker({
  plans,
  provider,
  selectedPlanId,
  onSelect,
  disabled,
  label,
}: {
  plans: PlanView[];
  provider: CheckoutProviderName;
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  disabled: boolean;
  label: string;
}): React.JSX.Element | null {
  const available = plans.filter((plan) =>
    plan.prices.some((price) => price.provider === provider),
  );
  if (available.length === 0) return null;
  return (
    <View className="gap-2" accessibilityLabel={label}>
      <Text className="text-sm font-medium">{label}</Text>
      <View className="gap-2">
        {available.map((plan) => {
          const price = plan.prices.find((entry) => entry.provider === provider);
          const selected = plan.id === selectedPlanId;
          return (
            <Pressable
              key={plan.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(plan.id)}
              className={`gap-1 rounded-lg border p-3 ${selected ? "border-primary" : "border-border"}`}
            >
              <Text className="text-sm font-medium">{plan.name}</Text>
              {price ? (
                <Text className="text-xs text-muted-foreground">
                  {`${(price.amountMinor / 100).toFixed(2)} ${price.currency}`}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
