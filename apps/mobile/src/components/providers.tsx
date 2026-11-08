import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { makeNativeQueryClient, nativeQueryCacheScope } from "@/lib/query-client";
import { useOfflineSync } from "@/hooks/use-offline";

import { ExpoAnalyticsProvider } from "@/lib/analytics";

import { PlatformI18nProvider, useTranslations } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { Header } from "@/components/header";
import { ActivityIndicator, View } from "react-native";
import { useCanonicalQueryAuthScope } from "@/lib/query-auth-scope";
import { orpcClient } from "@/lib/orpc";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuthenticatedLanding } from "@/features/app-shell/use-authenticated-landing";

const readCurrentApplication = () => orpcClient.me();

function AppNavigation() {
  const t = useTranslations("navigation");
  const commonT = useTranslations("common");
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const queryClient = useMemo(() => makeNativeQueryClient(), []);
  const canonical = useCanonicalQueryAuthScope(
    queryClient,
    session,
    sessionPending,
    readCurrentApplication,
  );
  const isAuthenticated = canonical.scope !== null;
  useAuthenticatedLanding(isAuthenticated);
  const cacheScope =
    canonical.isPending || canonical.error ? null : nativeQueryCacheScope(canonical.scope);
  const { isRestoring } = useOfflineSync(queryClient, cacheScope);
  if (canonical.error)
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text accessibilityRole="alert">{commonT("error")}</Text>
        <Button onPress={canonical.retry}>
          <Text>{commonT("retry")}</Text>
        </Button>
      </View>
    );
  if (canonical.isPending || isRestoring)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel={commonT("loading")} />
      </View>
    );

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ header: () => <Header /> }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="2fa" options={{ title: t("twoFactor") }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="dashboard" options={{ title: t("dashboard") }} />
          <Stack.Screen name="settings" options={{ title: t("settings") }} />
          <Stack.Screen name="workspace" options={{ title: t("workspace") }} />
          <Stack.Screen name="admin" options={{ title: t("admin") }} />

          <Stack.Screen name="billing" options={{ title: t("billing") }} />
          <Stack.Screen name="agent" options={{ title: t("agent") }} />
          <Stack.Screen name="pdf" options={{ title: t("pdf") }} />
          <Stack.Screen name="storage" options={{ title: t("storage") }} />
        </Stack.Protected>
      </Stack>

      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

export function ExpoRootLayout() {
  const app = <AppNavigation />;
  const analyticsApp = <ExpoAnalyticsProvider>{app}</ExpoAnalyticsProvider>;
  const instrumentedApp = <PlatformI18nProvider>{analyticsApp}</PlatformI18nProvider>;

  return instrumentedApp;
}
