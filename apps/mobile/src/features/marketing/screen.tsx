import type * as React from "react";
import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandWordmark, LeafGlyph } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { AppMenu } from "@/features/app-shell/app-menu";
import { useTranslations } from "@/lib/i18n";

/**
 * The public landing screen.
 *
 * The product statement, the two entry actions, and one strong olive panel.
 * Feature rows sit below the fold so the first screen is still about signing
 * in, not reading a brochure.
 */
export function MarketingScreen(): React.JSX.Element {
  const t = useTranslations("landing");
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-5"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
      }}
    >
      <View className="flex-row items-center justify-between gap-3">
        <BrandWordmark />
        <AppMenu />
      </View>

      <View className="overflow-hidden rounded-[32px] bg-primary p-6">
        <View
          pointerEvents="none"
          className="absolute -end-16 -top-20 size-56 rounded-full bg-primary-foreground/10"
        />
        <View
          pointerEvents="none"
          className="absolute -bottom-24 -start-14 size-48 rounded-full bg-primary-foreground/5"
        />
        <View className="gap-4">
          <View className="size-14 items-center justify-center rounded-2xl bg-primary-foreground/15">
            <LeafGlyph size={26} />
          </View>
          <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
            {t("eyebrow")}
          </Text>
          <Text
            accessibilityRole="header"
            className="text-[32px] font-semibold leading-9 tracking-tight text-primary-foreground"
          >
            {t("title")}
            {"\n"}
            <Text className="text-[32px] font-semibold leading-9 tracking-tight text-primary-foreground/80">
              {t("titleAccent")}
            </Text>
          </Text>
          <Text className="text-sm leading-6 text-primary-foreground/75">{t("subtitle")}</Text>
          <View className="gap-2 pt-1">
            <Link href="/auth/sign-up" asChild>
              <Button className="w-full bg-primary-foreground active:bg-primary-foreground/90">
                <Text className="text-primary">{t("signUp")}</Text>
              </Button>
            </Link>
            <Link href="/auth/sign-in" asChild>
              <Button
                variant="outline"
                className="w-full border-primary-foreground/30 bg-primary-foreground/10 active:bg-primary-foreground/20"
              >
                <Text className="text-primary-foreground">{t("signIn")}</Text>
              </Button>
            </Link>
          </View>
        </View>
      </View>

      <View className="gap-3">
        <FeatureRow
          index="01"
          title={t("featureSearchTitle")}
          description={t("featureSearchDescription")}
        />
        <FeatureRow
          index="02"
          title={t("featureWalletTitle")}
          description={t("featureWalletDescription")}
        />
        <FeatureRow
          index="03"
          title={t("featureSecureTitle")}
          description={t("featureSecureDescription")}
        />
      </View>

      <Text className="px-2 text-center text-xs leading-5 text-muted-foreground">
        {t("disclaimer")}
      </Text>
    </ScrollView>
  );
}

function FeatureRow({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="size-10 items-center justify-center rounded-xl bg-secondary">
        <Text className="text-[10px] font-bold tracking-wide text-primary">{index}</Text>
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-[15px] font-semibold text-foreground">{title}</Text>
        <Text className="text-[13px] leading-5 text-muted-foreground">{description}</Text>
      </View>
    </View>
  );
}
