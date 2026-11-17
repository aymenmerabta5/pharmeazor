import type * as React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Account rows for the app menu.
 *
 * Signed-out visitors get the two actions they came for, with the primary one
 * forward; signed-in users see who they are and a single, quiet way out. Rows
 * stay typographic so the whole menu reads as one list.
 */
export function MenuAccountSection({
  signedIn,
  userLabel,
  signOutPending,
  onSignIn,
  onSignUp,
  onProfile,
  onSettings,
  onSignOut,
}: {
  signedIn: boolean;
  userLabel: string | null;
  signOutPending: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}): React.JSX.Element {
  const t = useTranslations("menu");

  return (
    <View className="border-t border-border pt-4">
      <Text className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {signedIn && userLabel ? t("signedInAs", { name: userLabel }) : t("accountTitle")}
      </Text>

      {signedIn ? (
        <View>
          <MenuTextRow label={t("profile")} onPress={onProfile} />
          <MenuTextRow label={t("settings")} onPress={onSettings} />
          <MenuTextRow
            label={t("signOut")}
            tone="danger"
            pending={signOutPending}
            onPress={onSignOut}
          />
        </View>
      ) : (
        <View>
          <MenuTextRow label={t("signIn")} tone="muted" onPress={onSignIn} />
          <MenuTextRow label={t("signUp")} tone="primary" onPress={onSignUp} />
        </View>
      )}
    </View>
  );
}

function MenuTextRow({
  label,
  tone = "default",
  pending = false,
  onPress,
}: {
  label: string;
  tone?: "default" | "muted" | "primary" | "danger";
  pending?: boolean;
  onPress(): void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-2 rounded-lg px-1 active:opacity-60"
    >
      <Text
        className={cn(
          "text-[22px] leading-7 tracking-tight",
          tone === "muted" && "text-muted-foreground",
          tone === "primary" && "font-medium text-primary",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-foreground",
        )}
      >
        {label}
      </Text>
      {pending ? <ActivityIndicator size="small" /> : null}
    </Pressable>
  );
}
