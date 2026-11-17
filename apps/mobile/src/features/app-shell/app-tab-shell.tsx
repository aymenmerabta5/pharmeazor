import type * as React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTopBar } from "./app-topbar";
import { TabBar } from "./tab-bar";
import { useKeyboardVisible } from "./use-keyboard-visible";

/**
 * The signed-in phone shell.
 *
 * The safe area, the product bar, the screen, and the tab bar share one
 * column. The composer screens keep the keyboard from covering the input, and
 * the tab bar steps out of the way while the keyboard is open.
 */
export function AppTabShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <AppTopBar />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {children}
      </KeyboardAvoidingView>
      {keyboardVisible ? null : <TabBar bottomInset={insets.bottom} />}
    </View>
  );
}
