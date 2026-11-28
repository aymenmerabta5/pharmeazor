import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The billing screen while the plan catalog and account reads settle. */
export function BillingSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full" />
        </View>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-2/3" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-3/4" />
        </View>
        <View className="gap-3 px-5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-1/2" />
        </View>
        <View className="gap-3 px-5">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </View>
      </View>

      <Skeleton className="h-10 w-full rounded-lg" />
    </ScreenSkeleton>
  );
}
