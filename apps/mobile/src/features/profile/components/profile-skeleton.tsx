import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The profile tab while the account identity loads. */
export function ProfileSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton className="gap-5">
      <View className="gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </View>

      <View className="gap-3 overflow-hidden rounded-[28px] bg-mark p-5">
        <View className="items-center gap-3">
          <Skeleton className="size-20 rounded-full bg-mark-foreground/15" />
          <Skeleton className="h-6 w-40 bg-mark-foreground/15" />
          <Skeleton className="h-4 w-52 bg-mark-foreground/10" />
          <Skeleton className="h-6 w-20 rounded-full bg-mark-foreground/15" />
        </View>
      </View>

      <View className="gap-2.5">
        <Skeleton className="h-3 w-28" />
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {[0, 1, 2, 3, 4].map((index) => (
            <View
              key={index}
              className={
                index === 0
                  ? "flex-row items-center gap-3 px-4 py-3"
                  : "flex-row items-center gap-3 border-t border-border px-4 py-3"
              }
            >
              <Skeleton className="size-10 rounded-xl" />
              <View className="flex-1 gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-2.5">
        <View className="gap-1.5 px-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-3/4" />
        </View>
        <View className="rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-10 w-full rounded-lg" />
        </View>
      </View>

      <Skeleton className="h-10 w-full rounded-lg" />
    </ScreenSkeleton>
  );
}
