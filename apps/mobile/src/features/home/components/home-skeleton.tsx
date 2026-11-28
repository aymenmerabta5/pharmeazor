import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The signed-in home tab while the greeting and prompt mount. */
export function HomeSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton className="gap-6">
      <View className="gap-3 overflow-hidden rounded-[28px] bg-mark p-5">
        <View className="flex-row items-center gap-2">
          <Skeleton className="size-11 rounded-2xl bg-mark-foreground/15" />
          <Skeleton className="h-4 w-32 bg-mark-foreground/15" />
        </View>
        <Skeleton className="h-8 w-4/5 bg-mark-foreground/15" />
        <Skeleton className="h-4 w-full bg-mark-foreground/10" />
        <Skeleton className="h-4 w-2/3 bg-mark-foreground/10" />
        <Skeleton className="mt-2 h-12 w-full rounded-2xl bg-mark-foreground/15" />
      </View>

      <View className="gap-3">
        <Skeleton className="h-5 w-36" />
        <View className="gap-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full rounded-2xl" />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Skeleton className="h-5 w-28" />
        <View className="flex-row flex-wrap gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-10 w-24 rounded-full" />
          ))}
        </View>
      </View>

      <Skeleton className="mx-auto h-3 w-3/4" />
    </ScreenSkeleton>
  );
}
