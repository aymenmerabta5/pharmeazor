import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The wallet title block.
 *
 * The kicker names the area, the title names the page, and one line explains
 * what the page holds. It stays outside the hero so the balance panel is the
 * only bold surface above the fold.
 */
export function WalletHeader({ t }: { t: NamespaceTranslate<"wallet"> }): React.JSX.Element {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {t("kicker")}
      </Text>
      <Text accessibilityRole="header" className="text-[28px] font-semibold tracking-tight">
        {t("title")}
      </Text>
      <Text className="text-sm leading-6 text-muted-foreground">{t("description")}</Text>
    </View>
  );
}
