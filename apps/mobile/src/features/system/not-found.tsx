import * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n";

export function NotFoundScreen(): React.JSX.Element {
  const t = useTranslations("errors");
  return (
    <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
      <Text className="text-2xl font-bold tracking-tight">{t("notFoundTitle")}</Text>
      <Text className="text-sm text-muted-foreground">{t("notFoundDescription")}</Text>
      <View className="mt-3">
        <Link href="/" asChild>
          <Button>
            <Text>{t("backHome")}</Text>
          </Button>
        </Link>
      </View>
    </View>
  );
}
