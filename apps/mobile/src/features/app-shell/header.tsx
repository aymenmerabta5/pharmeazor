import * as React from "react";
import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { useHeaderIdentity } from "./queries";
import { getInitials } from "./model";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleSwitcher, useTranslations } from "@/lib/i18n";

export function Header(): React.JSX.Element {
  const t = useTranslations("header");
  const { user, isPending } = useHeaderIdentity();
  const isAuthed = !!user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <View className="border-b border-border bg-background">
      <View className="min-h-14 flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-3">
          <Link href="/" asChild>
            <Button variant="ghost" size="sm" accessibilityLabel={t("home")}>
              <BrandWordmark />
            </Button>
          </Link>
        </View>
        <View className="flex-row items-center gap-2">
          <LocaleSwitcher />
          {isPending ? (
            <Skeleton accessibilityLabel={t("userMenu")} className="size-11 rounded-full" />
          ) : isAuthed ? (
            <Link href="/settings" asChild>
              <Button size="icon" variant="secondary" accessibilityLabel={t("userMenu")}>
                <Text className="text-[11px] font-bold">{initials}</Text>
              </Button>
            </Link>
          ) : (
            <View className="flex-row gap-2">
              <Link href="/sign-in" asChild>
                <Button variant="outline" size="sm">
                  <Text>{t("signIn")}</Text>
                </Button>
              </Link>
              <Link href="/sign-up" asChild>
                <Button size="sm">
                  <Text>{t("signUp")}</Text>
                </Button>
              </Link>
            </View>
          )}
        </View>
      </View>
      {isAuthed ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 px-4 pb-2"
        >
          <Link href="/dashboard" asChild>
            <Button variant="ghost" size="sm">
              <Text>{t("dashboard")}</Text>
            </Button>
          </Link>
          <Link href="/agent" asChild>
            <Button variant="ghost" size="sm">
              <Text>{t("agent")}</Text>
            </Button>
          </Link>
          <Link href="/pdf" asChild>
            <Button variant="ghost" size="sm">
              <Text>{t("pdf")}</Text>
            </Button>
          </Link>
          <Link href="/billing" asChild>
            <Button variant="ghost" size="sm">
              <Text>{t("billing")}</Text>
            </Button>
          </Link>
          <Link href="/settings" asChild>
            <Button variant="ghost" size="sm">
              <Text>{t("settings")}</Text>
            </Button>
          </Link>
        </ScrollView>
      ) : null}
    </View>
  );
}
