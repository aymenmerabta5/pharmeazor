import type * as React from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { BrandWordmark } from "@/components/brand-mark";
import { Text } from "@/components/ui/text";
import { AppMenu } from "./app-menu";
import { getInitials } from "@/features/app-shell/model";
import { useHeaderIdentity } from "@/features/app-shell/queries";

/**
 * The top bar shared by the signed-in tabs.
 *
 * It is deliberately quiet: the leaf and wordmark identify the product, the
 * language control stays one tap away, and the avatar opens the profile tab.
 */
export function AppTopBar(): React.JSX.Element {
  const { user } = useHeaderIdentity();
  const initials = getInitials(user?.name, user?.email);
  return (
    <View className="border-b border-border bg-background">
      <View className="min-h-14 flex-row items-center justify-between gap-3 px-4">
        <Link href="/home" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="pharmeazor home">
            <BrandWordmark />
          </Pressable>
        </Link>
        <View className="flex-row items-center gap-2">
          <AppMenu />
          <Link href="/profile" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={user?.name ?? user?.email ?? "Profile"}
              className="size-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
            >
              <Text className="text-xs font-bold text-primary-foreground">{initials}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
