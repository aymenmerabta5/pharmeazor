import type * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/skeleton";

/** The product bar while the navigator is still resolving. */
function HeaderSkeleton(): React.JSX.Element {
  return (
    <View className="border-b border-border bg-background">
      <View className="min-h-14 flex-row items-center justify-between px-4">
        <Skeleton className="h-6 w-32" />
        <View className="flex-row items-center gap-2">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </View>
      </View>
    </View>
  );
}

/** The four-tab bar while the navigator is still resolving. */
function TabBarSkeleton({ bottomInset }: { bottomInset: number }): React.JSX.Element {
  return (
    <View
      className="border-t border-border bg-card px-2 pt-1.5"
      style={{ paddingBottom: Math.max(bottomInset, 6) }}
    >
      <View className="flex-row items-stretch gap-1">
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            className="min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl px-1 py-1.5"
          >
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-2 w-10" />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The signed-in chrome, copied as static boxes.
 *
 * The auth boundary holds the navigator back until the session resolves, so
 * the header and the tab bar cannot render themselves. This frame keeps their
 * height and safe-area insets in place so the screen does not jump when the
 * real chrome mounts. Nothing here is tappable.
 */
export function AppShellSkeleton({
  children,
  tabs = false,
}: {
  children: React.ReactNode;
  tabs?: boolean;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HeaderSkeleton />
      <View className="flex-1">{children}</View>
      {tabs ? <TabBarSkeleton bottomInset={insets.bottom} /> : null}
    </View>
  );
}
