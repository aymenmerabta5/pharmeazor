import type * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

export interface HomeSuggestion {
  readonly key: string;
  readonly label: string;
  readonly question: string;
}

/**
 * Four likely questions, laid out two per row.
 *
 * A phone cannot show a long suggestion list above the fold, so the cards are
 * equal height and the question itself is the primary text. Tapping sends the
 * question straight to the assistant.
 */
export function HomeSuggestions({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: readonly HomeSuggestion[];
  onSelect: (question: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-3">
      <Text className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </Text>
      <View className="gap-3">
        <View className="flex-row gap-3">
          {items.slice(0, 2).map((item) => (
            <SuggestionCard key={item.key} item={item} onSelect={onSelect} />
          ))}
        </View>
        <View className="flex-row gap-3">
          {items.slice(2, 4).map((item) => (
            <SuggestionCard key={item.key} item={item} onSelect={onSelect} />
          ))}
        </View>
      </View>
    </View>
  );
}

function SuggestionCard({
  item,
  onSelect,
}: {
  item: HomeSuggestion;
  onSelect: (question: string) => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.question}
      onPress={() => onSelect(item.question)}
      className="min-h-[118px] flex-1 gap-2 rounded-2xl border border-border bg-card p-4 active:bg-accent"
    >
      <Text className="self-start rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
        {item.label}
      </Text>
      <Text className="text-[13px] leading-5 text-foreground">{item.question}</Text>
    </Pressable>
  );
}
