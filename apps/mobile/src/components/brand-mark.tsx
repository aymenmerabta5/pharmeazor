import type * as React from "react";
import { Text, View } from "react-native";
import { cn } from "@/lib/utils";

/**
 * The pharmeazor leaf, drawn from two views.
 *
 * The web application draws the leaf with SVG. Native has no SVG renderer in
 * this composition, so the mark is assembled from a rounded view and a stem.
 * `toneClassName` lets the same glyph sit on a light card or on the olive hero
 * without duplicating the geometry.
 */
export function LeafGlyph({
  size = 22,
  toneClassName = "bg-primary-foreground",
  className,
}: {
  size?: number;
  toneClassName?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      accessible={false}
      className={cn("items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <View
        className={cn("absolute", toneClassName)}
        style={{
          width: size,
          height: size,
          borderTopLeftRadius: size,
          borderBottomRightRadius: size,
          transform: [{ rotate: "-12deg" }],
        }}
      />
      <View
        className={cn("absolute", toneClassName)}
        style={{
          top: size * 0.62,
          width: Math.max(2, size * 0.1),
          height: size * 0.38,
          borderRadius: 2,
        }}
      />
    </View>
  );
}

export function BrandMark({
  size = "default",
  className,
}: {
  size?: "default" | "large";
  className?: string;
}): React.JSX.Element {
  const large = size === "large";
  return (
    <View
      accessible={false}
      className={cn(
        "shrink-0 items-center justify-center bg-mark",
        large ? "size-14 rounded-2xl" : "size-9 rounded-xl",
        className,
      )}
    >
      <LeafGlyph size={large ? 26 : 15} toneClassName="bg-mark-foreground" />
    </View>
  );
}

export function BrandWordmark({
  size = "default",
}: {
  size?: "default" | "large";
}): React.JSX.Element {
  const large = size === "large";
  return (
    <View
      accessible
      accessibilityLabel="pharmeazor"
      style={{ direction: "ltr" }}
      className="shrink-0 flex-row items-center gap-2"
    >
      <BrandMark size={size} />
      <Text
        className={cn(
          "font-semibold tracking-tight text-primary",
          large ? "text-2xl" : "text-[17px]",
        )}
      >
        pharmeazor
      </Text>
    </View>
  );
}
