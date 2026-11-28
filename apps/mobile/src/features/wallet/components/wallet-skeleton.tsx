import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The wallet tab while the balance, plan, and payment sections load. */
export function WalletSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton className="gap-5">
      <View className="gap-1">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-3/4" />
      </View>

      <View className="gap-4 overflow-hidden rounded-[28px] bg-mark p-5">
        <Skeleton className="h-3 w-24 bg-mark-foreground/15" />
        <Skeleton className="h-12 w-44 bg-mark-foreground/15" />
        <Skeleton className="h-4 w-full bg-mark-foreground/10" />
        <View className="flex-row flex-wrap gap-2">
          <Skeleton className="h-10 w-28 rounded-lg bg-mark-foreground/15" />
          <Skeleton className="h-10 w-32 rounded-lg bg-mark-foreground/15" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-2/3" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-3/4" />
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
