import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { locales, usePlatformI18n, useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Language rows for the app menu.
 *
 * The row shows the language in force and opens only on tap, so the menu keeps
 * one line per concern. The choices read as plain rows: the active one holds
 * the foreground, the others step back.
 */
export function MenuLanguageSection(): React.JSX.Element {
  const { locale, setLocale } = usePlatformI18n();
  const t = useTranslations("localeSwitcher");
  const menu = useTranslations("menu");
  const [open, setOpen] = React.useState(false);

  return (
    <View className="border-t border-border pt-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menu("languageTitle")}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="min-h-12 flex-row items-center justify-between gap-3 rounded-lg px-1 active:opacity-60"
      >
        <Text className="text-xl leading-7 tracking-tight text-foreground">
          {menu("languageTitle")}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-base text-muted-foreground">{t(locale)}</Text>
          <Chevron open={open} />
        </View>
      </Pressable>

      {open ? (
        <View accessibilityRole="radiogroup" className="ps-4 pt-1">
          {locales.map((candidate) => {
            const active = locale === candidate;
            return (
              <Pressable
                key={candidate}
                accessibilityRole="radio"
                accessibilityLabel={t(candidate)}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (!active) void setLocale(candidate);
                  setOpen(false);
                }}
                className="min-h-11 justify-center rounded-lg px-1 active:opacity-60"
              >
                <Text
                  className={cn(
                    "text-lg leading-7 tracking-tight",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(candidate)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const chevronRotation = {
  ltr: { closed: "rotate-45", open: "rotate-[225deg]" },
  rtl: { closed: "-rotate-45", open: "rotate-[135deg]" },
} as const;

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  const { direction } = usePlatformI18n();
  const rotation = chevronRotation[direction === "rtl" ? "rtl" : "ltr"];
  return (
    <View
      accessible={false}
      className={cn(
        "size-2 border-b-2 border-e-2 border-muted-foreground",
        open ? rotation.open : rotation.closed,
      )}
    />
  );
}
