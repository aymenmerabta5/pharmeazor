import type * as React from "react";
import { Pressable, View } from "react-native";
import type { Href } from "expo-router";
import { Text } from "@/components/ui/text";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AppMenuDestination } from "../use-app-menu";

/**
 * Destination rows for the app menu.
 *
 * The public entry points are set large, the way a native menu reads; the
 * signed-in workspace keeps the same geometry at a smaller size under its own
 * caption, so the two groups never compete.
 */
export function MenuNavSection({
  primary,
  workspace,
  onNavigate,
}: {
  primary: readonly AppMenuDestination[];
  workspace: readonly AppMenuDestination[];
  onNavigate(href: Href): void;
}): React.JSX.Element {
  const header = useTranslations("header");
  return (
    <View>
      <View accessibilityRole="menu">
        {primary.map((destination) => (
          <MenuDestinationRow
            key={String(destination.href)}
            destination={destination}
            large
            onPress={() => onNavigate(destination.href)}
          />
        ))}
      </View>
      {workspace.length > 0 ? (
        <View accessibilityRole="menu" className="mt-4 border-t border-border pt-4">
          <Text className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {header("workspace")}
          </Text>
          {workspace.map((destination) => (
            <MenuDestinationRow
              key={String(destination.href)}
              destination={destination}
              onPress={() => onNavigate(destination.href)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MenuDestinationRow({
  destination,
  large = false,
  onPress,
}: {
  destination: AppMenuDestination;
  large?: boolean;
  onPress(): void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={destination.label}
      accessibilityState={{ selected: destination.current }}
      onPress={onPress}
      className={cn(
        "justify-center rounded-lg px-1 active:opacity-60",
        large ? "min-h-14" : "min-h-11",
      )}
    >
      <Text
        className={cn(
          large
            ? "text-[27px] font-medium leading-[34px] tracking-tight"
            : "text-xl leading-7 tracking-tight",
          destination.current ? "text-primary" : "text-foreground",
        )}
      >
        {destination.label}
      </Text>
    </Pressable>
  );
}
