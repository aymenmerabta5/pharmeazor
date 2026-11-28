import type * as React from "react";
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

/** The balance and instructions while the manual-payment summary loads. */
export function ManualSummaryPending({ showBalance }: { showBalance: boolean }): React.JSX.Element {
  return (
    <View className="gap-3">
      {showBalance ? (
        <View className="gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </View>
      ) : null}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-32 rounded-lg" />
    </View>
  );
}

/** Two placeholder rows while the payment history loads. */
export function ManualHistoryPending(): React.JSX.Element {
  return (
    <View className="gap-3">
      {[0, 1].map((index) => (
        <View key={index} className="gap-2 border-b border-border py-3">
          <View className="flex-row items-center justify-between gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </View>
          <Skeleton className="h-4 w-48" />
        </View>
      ))}
    </View>
  );
}
