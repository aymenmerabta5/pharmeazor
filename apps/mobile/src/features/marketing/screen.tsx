import { View, ScrollView } from "react-native";
import { Link } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LocaleSwitcher, useTranslations } from "@/lib/i18n";

export function MarketingScreen() {
  const t = useTranslations("marketing");
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-xl self-center px-6 pb-10 pt-16 gap-5">
        <View className="flex-row justify-end">
          <LocaleSwitcher />
        </View>

        <Text className="text-sm text-muted-foreground">{t("hero.eyebrow")}</Text>
        <Text
          accessibilityRole="header"
          className="text-4xl font-semibold tracking-tight text-foreground"
        >
          {t("hero.title")}
          {"\n"}
          <Text className="text-4xl font-semibold tracking-tight text-primary">
            {t("hero.titleAccent")}
          </Text>
        </Text>
        <Text className="text-base leading-7 text-muted-foreground">{t("heroSubtitle")}</Text>
        <View className="flex-row flex-wrap gap-3 mt-2">
          <Link href="/(auth)/sign-up" asChild>
            <Button>
              <Text>{t("ctaSignUp")}</Text>
            </Button>
          </Link>
          <Link href="/(auth)/sign-in" asChild>
            <Button variant="outline">
              <Text>{t("ctaSignIn")}</Text>
            </Button>
          </Link>
        </View>
        <View className="mt-6 gap-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("single.tokensTitle")}</CardTitle>
              <CardDescription>{t("single.tokensDescription")}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("features.apiTitle")}</CardTitle>
              <CardDescription>{t("features.apiDescriptionNext")}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("features.billingTitle")}</CardTitle>
              <CardDescription>{t("features.billingDescription")}</CardDescription>
            </CardHeader>
          </Card>
        </View>
        <Text className="mt-6 text-xs text-muted-foreground text-center">
          {t("footer.tagline")}
        </Text>
      </View>
    </ScrollView>
  );
}
