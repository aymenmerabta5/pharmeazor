import type * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Link, type Href } from "expo-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { LocaleSwitcher } from "@/lib/i18n";

export interface ProfileLink {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly monogram: string;
  readonly href: Href;
}

/**
 * The account tab.
 *
 * Identity first, then destinations as a list. A list beats a grid on a phone:
 * every row keeps a 44 px target, the description stays readable, and the
 * chevron makes the destination obvious without an icon package.
 */
export function ProfileView({
  name,
  email,
  initials,
  roleLabel,
  kicker,
  title,
  description,
  quickLinksTitle,
  links,
  languageTitle,
  languageDescription,
  signOutLabel,
  signOutPending,
  onSignOut,
}: {
  name: string | null;
  email: string | null;
  initials: string;
  roleLabel: string;
  kicker: string;
  title: string;
  description: string;
  quickLinksTitle: string;
  links: readonly ProfileLink[];
  languageTitle: string;
  languageDescription: string;
  signOutLabel: string;
  signOutPending: boolean;
  onSignOut: () => void;
}): React.JSX.Element {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 pb-8 pt-4">
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {kicker}
        </Text>
        <Text accessibilityRole="header" className="text-[28px] font-semibold tracking-tight">
          {title}
        </Text>
        <Text className="text-sm leading-6 text-muted-foreground">{description}</Text>
      </View>

      <View className="overflow-hidden rounded-[28px] bg-primary p-5">
        <View
          pointerEvents="none"
          className="absolute -end-14 -top-20 size-52 rounded-full bg-primary-foreground/10"
        />
        <View className="items-center gap-3">
          <View className="size-20 items-center justify-center rounded-full bg-primary-foreground/15">
            <Text className="text-2xl font-semibold text-primary-foreground">{initials}</Text>
          </View>
          <View className="items-center gap-1">
            <Text className="text-xl font-semibold text-primary-foreground">{name}</Text>
            {email ? <Text className="text-sm text-primary-foreground/75">{email}</Text> : null}
          </View>
          <Badge variant="secondary">
            <Text>{roleLabel}</Text>
          </Badge>
        </View>
      </View>

      <View className="gap-2.5">
        <Text className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {quickLinksTitle}
        </Text>
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {links.map((link, index) => (
            <Link key={link.key} href={link.href} asChild>
              <Pressable
                className={
                  index === 0
                    ? "min-h-16 flex-row items-center gap-3 px-4 py-3 active:bg-accent"
                    : "min-h-16 flex-row items-center gap-3 border-t border-border px-4 py-3 active:bg-accent"
                }
              >
                <View className="size-10 items-center justify-center rounded-xl bg-secondary">
                  <Text className="text-[10px] font-bold tracking-wide text-primary">
                    {link.monogram}
                  </Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-medium text-foreground">{link.label}</Text>
                  <Text className="text-xs leading-4 text-muted-foreground">
                    {link.description}
                  </Text>
                </View>
                <Text className="text-lg text-muted-foreground">›</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>

      <View className="gap-2.5">
        <View className="gap-1 px-1">
          <Text className="text-base font-semibold text-foreground">{languageTitle}</Text>
          <Text className="text-xs leading-5 text-muted-foreground">{languageDescription}</Text>
        </View>
        <View className="rounded-2xl border border-border bg-card p-4">
          <LocaleSwitcher />
        </View>
      </View>

      <Button
        variant="outline"
        className="border-destructive/40 bg-card"
        isLoading={signOutPending}
        disabled={signOutPending}
        onPress={onSignOut}
      >
        <Text className="text-destructive">{signOutLabel}</Text>
      </Button>
    </ScrollView>
  );
}
