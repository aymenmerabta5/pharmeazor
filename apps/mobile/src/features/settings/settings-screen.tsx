import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSettingsIdentityQuery } from "./queries";
import { useProfileForm } from "./use-profile-form";
import { ProfileView } from "./components/profile-view";
import type { SettingsUser } from "./model";
import { usePasswordForm } from "./use-password-form";
import { useTwoFactorSettings } from "./use-two-factor-settings";
import { PasswordView } from "./components/password-view";
import { TwoFactorView } from "./components/two-factor-view";
import { useIdentitySessions } from "./use-identity-sessions";
import { SessionsView } from "./components/sessions-view";
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";

export function SettingsScreen(): React.JSX.Element {
  const identity = useSettingsIdentityQuery();
  const t = useSurfaceTranslations("settings");
  const errors = useSurfaceTranslations("errors");
  const common = useSurfaceTranslations("common");
  if (identity.isPending)
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (identity.error)
    return (
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Alert accessibilityRole="alert" variant="destructive">
          <AlertTitle>{errors("genericTitle")}</AlertTitle>
          <AlertDescription>{errors("genericDescription")}</AlertDescription>
        </Alert>
        <Button onPress={() => void identity.retry()}>
          <Text>{common("retry")}</Text>
        </Button>
      </View>
    );
  if (!identity.user)
    return (
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Text className="text-2xl font-bold">{t("native.signInRequired")}</Text>
        <Link href="/(auth)/sign-in" asChild>
          <Button>
            <Text>{t("native.signIn")}</Text>
          </Button>
        </Link>
      </View>
    );
  return <SettingsPanels key={identity.user.id + ":" + identity.sessionId} user={identity.user} />;
}
function SettingsPanels({ user }: { user: SettingsUser }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic">
      <View className="w-full max-w-[760px] self-center gap-5 p-5">
        <View className="gap-1">
          <Text className="text-xs font-semibold text-primary">{t("native.kicker")}</Text>
          <Text className="text-3xl font-bold">{t("title")}</Text>
          <Text className="text-sm text-muted-foreground">{t("description")}</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Link href="/workspace" asChild>
            <Button variant="outline">
              <Text>{t("native.organizations")}</Text>
            </Button>
          </Link>
          {user.role === "admin" || user.role === "superAdmin" ? (
            <Link href="/admin" asChild>
              <Button variant="outline">
                <Text>{t("admin")}</Text>
              </Button>
            </Link>
          ) : null}
        </View>
        <ProfileSection key={user.id} user={user} />
        <PasswordSection />
        <TwoFactorSection />
        <View className="flex-row gap-2">
          <Link href="/(auth)/forgot-password" asChild>
            <Button variant="outline">
              <Text>{t("native.forgotPassword")}</Text>
            </Button>
          </Link>
          <Link href="/2fa" asChild>
            <Button variant="outline">
              <Text>{t("twoFactor.title")}</Text>
            </Button>
          </Link>
        </View>
        <SessionsSection />
        <DangerZoneCard />
      </View>
    </ScrollView>
  );
}
function ProfileSection({ user }: { user: SettingsUser }): React.JSX.Element {
  const model = useProfileForm(user.name ?? "");
  return <ProfileView model={model} email={user.email} />;
}
function PasswordSection(): React.JSX.Element {
  const model = usePasswordForm();
  return <PasswordView model={model} />;
}
function TwoFactorSection(): React.JSX.Element {
  const model = useTwoFactorSettings();
  return <TwoFactorView model={model} />;
}
function SessionsSection(): React.JSX.Element {
  const model = useIdentitySessions({});
  return <SessionsView model={model} />;
}
