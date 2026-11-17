import type * as React from "react";
import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { TabIcon, type TabIconName } from "./tab-icon";
import { useTranslations } from "@/lib/i18n";

const TABS: readonly { href: "/home" | "/assistant" | "/wallet" | "/profile"; key: TabIconName }[] =
  [
    { href: "/home", key: "home" },
    { href: "/assistant", key: "assistant" },
    { href: "/wallet", key: "wallet" },
    { href: "/profile", key: "profile" },
  ];

/**
 * The custom bottom tab bar.
 *
 * Expo Router's `Tabs` requires `@react-navigation/bottom-tabs`, which this
 * composition does not ship. A `Slot` layout plus this bar provides the same
 * navigation contract with the pharmeazor look and no extra dependency.
 *
 * Every target is at least 52 px tall, the active tile is filled rather than
 * only tinted, and the label stays under the icon where a thumb expects it.
 */
export function TabBar({ bottomInset = 0 }: { bottomInset?: number }): React.JSX.Element {
  const t = useTranslations("tabs");
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View
      className="border-t border-border bg-card px-2 pt-1.5"
      style={{ paddingBottom: Math.max(bottomInset, 6) }}
    >
      <View className="flex-row items-stretch gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.key)}
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(tab.href)}
              className={cn(
                "min-h-[52px] flex-1 items-center justify-center gap-1 rounded-2xl px-1 py-1.5 active:bg-accent",
                active && "bg-secondary",
              )}
            >
              <TabIcon name={tab.key} active={active} />
              <Text
                numberOfLines={1}
                className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {t(tab.key)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
