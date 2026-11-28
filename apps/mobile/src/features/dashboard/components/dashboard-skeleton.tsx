import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The dashboard body while the profile and application identity load. */
export function DashboardSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton>
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Skeleton className="h-8 w-40" />
          <View className="flex-row gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </View>
        </View>
        <Skeleton className="h-4 w-4/5" />
      </View>

      <Skeleton className="h-px w-full" />

      <View className="gap-3">
        <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
          <View className="gap-2 px-5">
            <View className="flex-row items-center justify-between gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </View>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </View>
          <View className="flex-row flex-wrap gap-2 px-5">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </View>
        </View>

        <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
          <View className="px-5">
            <Skeleton className="h-6 w-32" />
          </View>
          <View className="gap-2 px-5">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-10 w-full rounded-lg" />
            ))}
          </View>
        </View>
      </View>
    </ScreenSkeleton>
  );
}
