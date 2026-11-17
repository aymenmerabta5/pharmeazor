import type * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * The balance, first.
 *
 * A wallet customer needs the number they can spend before anything else. The
 * olive panel is the only bold surface on the tab: the amount is the largest
 * text on the screen, and the two useful actions are one thumb away.
 */
export function WalletHero({
  balanceLabel,
  amount,
  pending,
  unavailable,
  error,
  description,
  topUpLabel,
  browsePlansLabel,
  onTopUp,
  onBrowsePlans,
}: {
  balanceLabel: string;
  amount: string | null;
  pending: boolean;
  unavailable: string;
  error: boolean;
  description: string;
  topUpLabel: string;
  browsePlansLabel: string;
  onTopUp: () => void;
  onBrowsePlans: () => void;
}): React.JSX.Element {
  return (
    <View className="overflow-hidden rounded-[28px] bg-primary p-5">
      <View
        pointerEvents="none"
        className="absolute -end-14 -top-20 size-52 rounded-full bg-primary-foreground/10"
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-24 -start-16 size-48 rounded-full bg-primary-foreground/5"
      />
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/75">
            {balanceLabel}
          </Text>
          <View className="h-5 w-7 justify-center rounded-md border-2 border-primary-foreground/80">
            <View className="absolute end-1 top-[5px] size-1.5 rounded-full bg-primary-foreground" />
          </View>
        </View>
        {pending ? (
          <View className="h-10 w-36 rounded-xl bg-primary-foreground/20" />
        ) : (
          <Text className="text-[34px] font-semibold leading-10 tracking-tight text-primary-foreground tabular-nums">
            {amount ?? "—"}
          </Text>
        )}
        <Text className="text-sm leading-6 text-primary-foreground/75">
          {error ? unavailable : description}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            onPress={onTopUp}
            className="bg-primary-foreground active:bg-primary-foreground/90"
          >
            <Text className="text-primary">{topUpLabel}</Text>
          </Button>
          <Button
            variant="outline"
            onPress={onBrowsePlans}
            className="border-primary-foreground/30 bg-primary-foreground/10 active:bg-primary-foreground/20"
          >
            <Text className="text-primary-foreground">{browsePlansLabel}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
