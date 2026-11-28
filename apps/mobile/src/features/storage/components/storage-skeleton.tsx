import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The storage screen while its client workspace mounts. */
export function StorageSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton className="max-w-[760px]">
      <View className="gap-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full" />
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="px-5">
          <Skeleton className="h-6 w-24" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="px-5">
          <Skeleton className="h-6 w-28" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <View className="flex-row flex-wrap gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </View>
        </View>
      </View>
    </ScreenSkeleton>
  );
}
