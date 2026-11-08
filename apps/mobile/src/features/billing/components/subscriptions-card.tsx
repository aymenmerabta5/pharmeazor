import type * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubscriptionView } from "../model";
import { formatBillingSubscriptionStatus } from "../status-labels";

import type { NamespaceTranslate } from "@/lib/i18n";
export function SubscriptionsCard({
  subscriptions,
  isPending,
  readError,
  t,
}: {
  subscriptions: readonly SubscriptionView[];
  isPending: boolean;
  readError: Error | null;
  t: NamespaceTranslate<"billing">;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("subscriptions")}</CardTitle>
        <CardDescription>{t("subscriptionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2">
        {isPending ? (
          <ActivityIndicator accessibilityLabel={t("loadingSubscriptions")} />
        ) : subscriptions.length === 0 ? (
          readError ? null : (
            <Text className="text-sm text-muted-foreground">{t("noSubscriptionsTitle")}</Text>
          )
        ) : (
          subscriptions.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <View className="gap-1">
                <Text className="text-sm">{item.provider}</Text>
                {item.currentPeriodEnd ? (
                  <Text className="text-xs text-muted-foreground">
                    {t("renews", { date: item.currentPeriodEnd })}
                  </Text>
                ) : null}
              </View>
              <Badge variant={item.status === "past_due" ? "destructive" : "secondary"}>
                <Text className="text-xs">{formatBillingSubscriptionStatus(item.status, t)}</Text>
              </Badge>
            </View>
          ))
        )}
      </CardContent>
    </Card>
  );
}
