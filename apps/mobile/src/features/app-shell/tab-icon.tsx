import type * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

export type TabIconName = "home" | "assistant" | "wallet" | "profile";

/**
 * Tab icons drawn with views.
 *
 * The mobile composition does not ship an icon package, so each glyph is a few
 * rounded views. They stay recognizable at 22-24 px, inherit the active colour,
 * and need no runtime asset.
 */
export function TabIcon({
  name,
  active,
}: {
  name: TabIconName;
  active: boolean;
}): React.JSX.Element {
  const stroke = cn("border-2", active ? "border-primary" : "border-muted-foreground");
  const fill = active ? "bg-primary" : "bg-muted-foreground";

  if (name === "home") {
    return (
      <View style={{ width: 22, height: 21 }}>
        <View
          className={cn("absolute rounded-[2px]", stroke)}
          style={{ width: 11, height: 11, start: 5.5, top: 0, transform: [{ rotate: "45deg" }] }}
        />
        <View
          className={cn("absolute rounded-[3px]", stroke)}
          style={{ width: 16, height: 11, start: 3, bottom: 0 }}
        />
      </View>
    );
  }

  if (name === "assistant") {
    return (
      <View style={{ width: 22, height: 21 }}>
        <View className={cn("rounded-[6px]", stroke)} style={{ width: 22, height: 15 }} />
        <View
          className={cn(
            "absolute border-x-[4px] border-t-[5px] border-x-transparent",
            active ? "border-t-primary" : "border-t-muted-foreground",
          )}
          style={{ start: 5, top: 14 }}
        />
      </View>
    );
  }

  if (name === "wallet") {
    return (
      <View
        className={cn("relative justify-center rounded-[5px]", stroke)}
        style={{ width: 22, height: 16 }}
      >
        <View
          className={cn("absolute rounded-full", fill)}
          style={{ width: 4, height: 4, end: 3, top: 4 }}
        />
      </View>
    );
  }

  return (
    <View style={{ width: 22, height: 21, alignItems: "center" }}>
      <View className={cn("rounded-full", stroke)} style={{ width: 9, height: 9 }} />
      <View
        className={cn(
          "absolute rounded-t-full border-2 border-b-0",
          active ? "border-primary" : "border-muted-foreground",
        )}
        style={{ width: 18, height: 9, bottom: 0 }}
      />
    </View>
  );
}
