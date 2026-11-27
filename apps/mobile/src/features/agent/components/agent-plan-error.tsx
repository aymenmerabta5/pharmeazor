import type * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The state shown when the plan check itself failed.
 *
 * A failed read is not the same as a missing plan, so the screen must not sell
 * an upgrade to someone who may already be paying. It says what happened and
 * offers the one safe action: read the subscription again.
 */
export function AgentPlanError({
  onRetry,
  t,
}: {
  onRetry(): void;
  t: NamespaceTranslate<"agent">;
}): React.JSX.Element {
  return (
    <View className="flex-1 justify-center bg-background p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("planErrorTitle")}</CardTitle>
          <CardDescription>{t("planErrorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onPress={onRetry}>
            <Text>{t("retryPlan")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
