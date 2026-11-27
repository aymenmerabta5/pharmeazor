import type * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The state an authenticated account sees before it has a live plan.
 *
 * The assistant is a paid surface: the same subscription the server checks is
 * checked here, and the card names the one action that unlocks it.
 */
export function AgentUpgrade({
  onManagePlan,
  t,
}: {
  onManagePlan(): void;
  t: NamespaceTranslate<"agent">;
}): React.JSX.Element {
  return (
    <View className="flex-1 justify-center bg-background p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("upgradeTitle")}</CardTitle>
          <CardDescription>{t("upgradeDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onPress={onManagePlan}>
            <Text>{t("seePlans")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
