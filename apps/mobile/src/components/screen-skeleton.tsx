import type * as React from "react";
import { ScrollView, View } from "react-native";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Shared frame for screen loading states.
 *
 * Every route renders the skeleton of the screen it is about to show, so the
 * first paint already has the page's shape instead of a centred spinner. The
 * boxes are decorative; assistive technology hears one loading status.
 */
export function ScreenSkeleton({
  children,
  className,
  scroll = true,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}): React.JSX.Element {
  const t = useTranslations("common");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("loading")}
      className="flex-1 bg-background"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-1"
      >
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="grow"
            showsVerticalScrollIndicator={false}
          >
            <View className={cn("w-full max-w-[960px] self-center gap-5 p-5", className)}>
              {children}
            </View>
          </ScrollView>
        ) : (
          <View className={cn("flex-1", className)}>{children}</View>
        )}
      </View>
    </View>
  );
}
