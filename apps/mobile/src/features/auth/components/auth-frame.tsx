import type * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandWordmark } from "@/components/brand-mark";
import { Text } from "@/components/ui/text";
import { AppMenu } from "@/features/app-shell/app-menu";

export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center justify-end px-4 pt-2">
        <AppMenu />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-5 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[32rem] self-center gap-6">
            <View className="items-center">
              <BrandWordmark size="large" />
            </View>
            <View className="gap-1.5">
              <Text
                accessibilityRole="header"
                className="text-center text-2xl font-semibold tracking-tight"
              >
                {title}
              </Text>
              <Text className="text-center text-sm leading-6 text-muted-foreground">
                {description}
              </Text>
            </View>
            <View className="gap-5">{children}</View>
            {footer}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
