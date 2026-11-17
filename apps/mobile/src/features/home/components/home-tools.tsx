import type * as React from "react";
import { Pressable, View } from "react-native";
import { Link, type Href } from "expo-router";
import { Text } from "@/components/ui/text";

export interface HomeTool {
  readonly key: string;
  readonly label: string;
  readonly href: Href;
}

/**
 * The rest of the app is one tap away, but the tools stay quiet pills.
 *
 * Wallet and assistant also live in the tab bar. Keeping the same destinations
 * here means the first screen never hides a capability behind a hidden menu.
 */
export function HomeTools({
  title,
  items,
}: {
  title: string;
  items: readonly HomeTool[];
}): React.JSX.Element {
  return (
    <View className="gap-2.5">
      <Text className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => (
          <Link key={item.key} href={item.href} asChild>
            <Pressable className="min-h-11 flex-row items-center gap-2 rounded-full border border-border bg-card px-4 active:bg-accent">
              <View className="size-2 rounded-full bg-primary" />
              <Text className="text-sm font-medium text-foreground">{item.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}
