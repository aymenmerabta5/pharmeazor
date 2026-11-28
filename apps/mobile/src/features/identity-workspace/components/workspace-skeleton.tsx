import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The workspace screen while permissions and membership load. */
export function WorkspaceSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton>
      <View className="gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-2/3" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-1/2" />
        </View>
        <View className="gap-3 px-5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-2/3" />
        </View>
        <View className="gap-3 px-5">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </View>
      </View>
    </ScreenSkeleton>
  );
}
