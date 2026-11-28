import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The assistant screen while the session and plan entitlement load. */
export function AgentSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton scroll={false} className="bg-background">
      <View className="gap-2 border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </View>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </View>
      </View>

      <View className="flex-1 justify-center gap-4 px-5 py-8">
        <View className="items-center gap-3">
          <Skeleton className="size-14 rounded-2xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </View>
        <View className="mt-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full rounded-2xl" />
          ))}
        </View>
      </View>

      <View className="border-t border-border px-3 pb-2 pt-2">
        <Skeleton className="h-12 w-full rounded-2xl" />
      </View>
    </ScreenSkeleton>
  );
}
