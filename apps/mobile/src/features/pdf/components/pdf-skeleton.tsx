import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The PDF screen while its template options and workspace mount. */
export function PdfSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton className="max-w-[760px]">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full" />
        </View>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-3/4" />
        </View>
        <View className="gap-3 px-5">
          <View className="flex-row flex-wrap gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-9 w-24 rounded-lg" />
            ))}
          </View>
          <Skeleton className="h-10 w-full rounded-lg" />
        </View>
      </View>
    </ScreenSkeleton>
  );
}
