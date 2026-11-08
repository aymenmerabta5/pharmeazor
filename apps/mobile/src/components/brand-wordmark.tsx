import type * as React from "react";
import { Text } from "react-native";

export function BrandWordmark(): React.JSX.Element {
  return (
    <Text
      accessibilityLabel="GhostInit"
      className="shrink-0 text-[15px] font-semibold tracking-tight"
    >
      <Text className="text-primary">Ghost</Text>
      <Text className="text-secondary-foreground">Init</Text>
    </Text>
  );
}
