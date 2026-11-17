import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * A quiet heading between wallet sections.
 *
 * The page already has one loud surface (the balance panel), so section titles
 * stay typographic: a short title and one optional line of context.
 */
export function WalletSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}): React.JSX.Element {
  return (
    <View className="gap-0.5 px-1">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-xs leading-5 text-muted-foreground">{description}</Text>
      ) : null}
    </View>
  );
}
