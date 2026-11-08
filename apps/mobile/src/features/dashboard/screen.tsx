import * as React from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { useDashboardIdentity } from "./queries";
import { authUserRole } from "./model";
import { SignOutButton } from "@/components/sign-out-button";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/lib/i18n";

export function DashboardScreen(): React.JSX.Element {
  const t = useTranslations("dashboard");
  const navigationT = useTranslations("navigation");
  const { user, isPending } = useDashboardIdentity();

  if (isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3">
        <Text className="text-xl font-bold">{t("unauthenticatedTitle")}</Text>
        <Text className="text-sm text-muted-foreground">{t("unauthenticatedDescription")}</Text>
        <View className="mt-4">
          <Link href="/sign-in" asChild>
            <Button>
              <Text>{t("signIn")}</Text>
            </Button>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5 gap-5 max-w-[960px] w-full self-center">
        <View className="gap-1">
          <View className="flex-row justify-between items-center">
            <Text className="text-2xl font-bold tracking-tight">{t("title")}</Text>
            <View className="flex-row gap-2">
              <Link href="/settings" asChild>
                <Button variant="outline" size="sm">
                  <Text>{t("header.settings")}</Text>
                </Button>
              </Link>
              <SignOutButton />
            </View>
          </View>
          <Text className="text-sm text-muted-foreground">{t("single.description")}</Text>
        </View>
        <View className="h-px bg-border" />
        <View className="gap-3">
          <Card>
            <CardHeader>
              <View className="flex-row justify-between items-center">
                <CardTitle>{t("single.profileTitle")}</CardTitle>
                <Badge>
                  <Text>{authUserRole(user)}</Text>
                </Badge>
              </View>
              <CardDescription>
                {t("identity.signedInAs", {
                  email: String(user?.email ?? ""),
                  name: String(user?.name ?? t("identity.nameNotSet")),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <View className="flex-row flex-wrap gap-2">
                <Link href="/settings" asChild>
                  <Button variant="outline" size="sm">
                    <Text>{t("identity.editProfile")}</Text>
                  </Button>
                </Link>
                <Link href="/billing" asChild>
                  <Button variant="outline" size="sm">
                    <Text>{t("identity.billing")}</Text>
                  </Button>
                </Link>
              </View>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("actions.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                <Link href="/storage" asChild>
                  <Button variant="outline">
                    <Text>{navigationT("storage")}</Text>
                  </Button>
                </Link>
                <Link href="/pdf" asChild>
                  <Button variant="outline">
                    <Text>{navigationT("pdf")}</Text>
                  </Button>
                </Link>
                <Link href="/agent" asChild>
                  <Button variant="outline">
                    <Text>{navigationT("agent")}</Text>
                  </Button>
                </Link>
                <Link href="/settings" asChild>
                  <Button variant="outline">
                    <Text>{t("actions.security")}</Text>
                  </Button>
                </Link>
                <Link href="/billing" asChild>
                  <Button variant="outline">
                    <Text>{t("actions.manageBilling")}</Text>
                  </Button>
                </Link>
              </View>
            </CardContent>
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}
