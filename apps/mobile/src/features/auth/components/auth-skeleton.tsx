import type * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandWordmark } from "@/components/brand-mark";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The sign-in, sign-up, recovery, and two-factor shell while their form
 * controllers mount. It mirrors `AuthFrame`, so the wordmark and card do not
 * jump when the form replaces the skeleton.
 */
export function AuthSkeleton({
  safeArea = true,
}: {
  safeArea?: boolean;
} = {}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <ScreenSkeleton scroll={false} className="bg-background">
      <View
        style={safeArea ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined}
        className="flex-1"
      >
        <View className="flex-row items-center justify-end px-4 pt-2">
          <Skeleton className="size-11 rounded-full" />
        </View>
        <ScrollView contentContainerClassName="flex-grow justify-center px-5 py-8">
          <View className="w-full max-w-[32rem] self-center gap-6">
            <View className="items-center">
              <BrandWordmark size="large" />
            </View>
            <View className="items-center gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-full max-w-[26rem]" />
            </View>
            <View className="gap-5">
              <View className="gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </View>
              {[0, 1].map((index) => (
                <View key={index} className="gap-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </View>
              ))}
              <Skeleton className="h-10 w-full rounded-lg" />
            </View>
            <Skeleton className="mx-auto h-9 w-40 rounded-lg" />
          </View>
        </ScrollView>
      </View>
    </ScreenSkeleton>
  );
}
