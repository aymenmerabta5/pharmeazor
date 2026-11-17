import type * as React from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { PlanView, SubscriptionView } from "@/features/billing/model";

/**
 * The plan strip under the balance.
 *
 * It answers "what am I on?" and "when does it end?" without repeating the
 * provider checkout table. The status badge uses the same labels as billing.
 */
export function WalletPlanCard({
  title,
  plan,
  subscription,
  statusLabel,
  periodEnd,
  renewsLabel,
  noRenewalLabel,
  noPlanTitle,
  noPlanDescription,
  actionLabel,
  onAction,
}: {
  title: string;
  plan: PlanView | null;
  subscription: SubscriptionView | null;
  statusLabel: string | null;
  periodEnd: string | null;
  renewsLabel: string;
  noRenewalLabel: string;
  noPlanTitle: string;
  noPlanDescription: string;
  actionLabel: string;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        {subscription && statusLabel ? (
          <Badge variant={subscription.status === "past_due" ? "destructive" : "secondary"}>
            <Text>{statusLabel}</Text>
          </Badge>
        ) : null}
      </View>
      {plan ? (
        <View className="gap-1.5">
          <Text className="text-xl font-semibold tracking-tight text-foreground">{plan.name}</Text>
          {periodEnd ? <Text className="text-sm text-muted-foreground">{periodEnd}</Text> : null}
          <Text className="text-sm leading-5 text-muted-foreground">
            {subscription?.autoRenew ? renewsLabel : noRenewalLabel}
          </Text>
        </View>
      ) : (
        <View className="gap-1">
          <Text className="text-base font-medium text-foreground">{noPlanTitle}</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{noPlanDescription}</Text>
        </View>
      )}
      <Button variant="outline" size="sm" onPress={onAction}>
        <Text>{actionLabel}</Text>
      </Button>
    </View>
  );
}
