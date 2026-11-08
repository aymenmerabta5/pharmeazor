import type * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
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
  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow items-center justify-center p-4 sm:p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[32rem] self-center gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold tracking-tight">{title}</Text>
              <Text className="text-sm text-muted-foreground">{description}</Text>
            </View>
            {children}
            {footer}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
