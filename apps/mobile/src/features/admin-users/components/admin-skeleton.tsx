import type * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The admin screen while the session, role, and first page of users load. */
export function AdminSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton>
      <View className="gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-2/3" />
        </View>
        <View className="gap-3 px-5">
          {[0, 1, 2].map((index) => (
            <View key={index} className="gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </View>
          ))}
          <Skeleton className="h-9 w-32 rounded-lg" />
        </View>
      </View>

      <View className="gap-4 rounded-[14px] border border-border bg-card py-5">
        <View className="gap-2 px-5">
          <View className="flex-row items-center justify-between gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </View>
          <Skeleton className="h-4 w-3/4" />
        </View>
        <View className="gap-3 px-5">
          <Skeleton className="h-10 w-full rounded-lg" />
          {[0, 1, 2, 3].map((index) => (
            <View key={index} className="gap-2 rounded-xl border border-border p-3">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </View>
                <Skeleton className="h-6 w-16 rounded-full" />
              </View>
              <View className="flex-row gap-2">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScreenSkeleton>
  );
}
