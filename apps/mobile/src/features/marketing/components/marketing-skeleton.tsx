import type * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandWordmark } from "@/components/brand-mark";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The public landing screen while the session-aware menu resolves. */
export function MarketingSkeleton(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <ScreenSkeleton scroll={false} className="bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View className="flex-row items-center justify-between gap-3">
          <BrandWordmark />
          <Skeleton className="size-11 rounded-full" />
        </View>

        <View className="gap-4 overflow-hidden rounded-[32px] bg-mark p-6">
          <Skeleton className="size-14 rounded-2xl bg-mark-foreground/15" />
          <Skeleton className="h-3 w-28 bg-mark-foreground/15" />
          <Skeleton className="h-8 w-full bg-mark-foreground/15" />
          <Skeleton className="h-8 w-2/3 bg-mark-foreground/15" />
          <Skeleton className="h-4 w-full bg-mark-foreground/10" />
          <Skeleton className="h-4 w-5/6 bg-mark-foreground/10" />
          <View className="gap-2 pt-1">
            <Skeleton className="h-11 w-full rounded-lg bg-mark-foreground/15" />
            <Skeleton className="h-11 w-full rounded-lg bg-mark-foreground/15" />
          </View>
        </View>

        <View className="gap-3">
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <Skeleton className="size-10 rounded-xl" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </View>
            </View>
          ))}
        </View>

        <Skeleton className="mx-auto h-3 w-3/4" />
      </ScrollView>
    </ScreenSkeleton>
  );
}
