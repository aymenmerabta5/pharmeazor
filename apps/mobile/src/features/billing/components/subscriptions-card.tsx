import type * as React from "react";
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
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
          <>
            {[0, 1].map((index) => (
              <View
                key={index}
                className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <View className="gap-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </View>
                <Skeleton className="h-6 w-16 rounded-full" />
              </View>
            ))}
          </>
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
