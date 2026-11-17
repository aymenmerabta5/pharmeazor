import type * as React from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "@/lib/i18n";
import { AppMenuSheet } from "./components/app-menu-sheet";
import { useAppMenu } from "./use-app-menu";

/**
 * The app menu trigger and its full-screen menu.
 *
 * The language choice, destinations and the signed-out account actions used to
 * compete for space in the bars. They now live one tap away behind a familiar
 * menu, which keeps the bars quiet and gives every entry a full-size target.
 */
export function AppMenu(): React.JSX.Element {
  const t = useTranslations("menu");
  const menu = useAppMenu();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("open")}
        accessibilityState={{ expanded: menu.open }}
        onPress={menu.openMenu}
        className="size-11 items-center justify-center rounded-full border border-border bg-card active:bg-accent"
      >
        <MenuBars />
      </Pressable>
      <AppMenuSheet
        open={menu.open}
        onClose={menu.closeMenu}
        destinations={menu.destinations}
        signedIn={menu.signedIn}
        userLabel={menu.userLabel}
        signOutPending={menu.signOutPending}
        onNavigate={menu.go}
        onSignIn={() => menu.go("/sign-in")}
        onSignUp={() => menu.go("/sign-up")}
        onProfile={() => menu.go("/profile")}
        onSettings={() => menu.go("/settings")}
        onSignOut={menu.signOutFromMenu}
      />
    </>
  );
}

function MenuBars(): React.JSX.Element {
  return (
    <View accessible={false} className="w-5 gap-[5px]">
      <View className="h-[2px] w-5 rounded-full bg-foreground" />
      <View className="h-[2px] w-5 rounded-full bg-foreground" />
      <View className="h-[2px] w-3 rounded-full bg-foreground" />
    </View>
  );
}
