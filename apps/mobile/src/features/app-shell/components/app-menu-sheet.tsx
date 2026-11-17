import type * as React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Href } from "expo-router";
import { BrandWordmark } from "@/components/brand-mark";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
import { MenuAccountSection } from "./menu-account-section";
import { MenuLanguageSection } from "./menu-language-section";
import { MenuNavSection } from "./menu-nav-section";
import type { AppMenuDestination } from "../use-app-menu";

/**
 * The full-screen app menu.
 *
 * A sheet that only rises halfway makes the visitor hunt for the row they
 * want. This takes the whole screen instead: destinations at the top, the two
 * preference groups anchored to the bottom, and the safe-area insets kept off
 * the system bars.
 */
export function AppMenuSheet({
  open,
  onClose,
  destinations,
  signedIn,
  userLabel,
  signOutPending,
  onNavigate,
  onSignIn,
  onSignUp,
  onProfile,
  onSettings,
  onSignOut,
}: {
  open: boolean;
  onClose(): void;
  destinations: {
    primary: readonly AppMenuDestination[];
    workspace: readonly AppMenuDestination[];
  };
  signedIn: boolean;
  userLabel: string | null;
  signOutPending: boolean;
  onNavigate(href: Href): void;
  onSignIn(): void;
  onSignUp(): void;
  onProfile(): void;
  onSettings(): void;
  onSignOut(): void;
}): React.JSX.Element {
  const t = useTranslations("menu");
  const common = useTranslations("common");
  const { direction } = usePlatformI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={open}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        role="dialog"
        accessibilityLabel={t("title")}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        className="flex-1 bg-background"
        style={{ direction, paddingTop: insets.top + 6 }}
      >
        <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-1">
          <BrandWordmark />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={common("close")}
            onPress={onClose}
            className="size-11 items-center justify-center rounded-full active:bg-accent"
          >
            <CloseGlyph />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-5 pb-2 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <MenuNavSection
            primary={destinations.primary}
            workspace={destinations.workspace}
            onNavigate={onNavigate}
          />
          <View
            className="mt-auto gap-6 pt-10"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <MenuLanguageSection />
            <MenuAccountSection
              signedIn={signedIn}
              userLabel={userLabel}
              signOutPending={signOutPending}
              onSignIn={onSignIn}
              onSignUp={onSignUp}
              onProfile={onProfile}
              onSettings={onSettings}
              onSignOut={onSignOut}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function CloseGlyph(): React.JSX.Element {
  return (
    <View accessible={false} className="size-5 items-center justify-center">
      <View className="absolute h-[2px] w-5 rotate-45 rounded-full bg-foreground" />
      <View className="absolute h-[2px] w-5 -rotate-45 rounded-full bg-foreground" />
    </View>
  );
}
