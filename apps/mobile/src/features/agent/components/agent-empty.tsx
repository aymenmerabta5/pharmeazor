import type * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { LeafGlyph } from "@/components/brand-mark";
import { Text } from "@/components/ui/text";
import type { AgentSuggestion } from "../model";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The assistant before the first question.
 *
 * A new conversation is an invitation, not an empty log: the leaf introduces
 * the assistant, one sentence explains what it can answer, and the suggestion
 * rows give a thumb a real question to start with.
 */
export function AgentEmpty({
  suggestions,
  onSuggestion,
  error,
  t,
}: {
  suggestions: readonly AgentSuggestion[];
  onSuggestion: (question: string) => void;
  error: string | null;
  t: NamespaceTranslate<"agent">;
}): React.JSX.Element {
  return (
    <ScrollView
      contentContainerClassName="flex-grow justify-center gap-6 px-5 py-8"
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-3">
        <View className="size-16 items-center justify-center rounded-[22px] bg-primary">
          <LeafGlyph size={28} />
        </View>
        <Text
          accessibilityRole="header"
          className="text-center text-2xl font-semibold tracking-tight"
        >
          {t("title")}
        </Text>
        <Text className="max-w-[36ch] text-center text-sm leading-6 text-muted-foreground">
          {t("empty")}
        </Text>
      </View>
      {suggestions.length > 0 ? (
        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("suggestionsTitle")}
          </Text>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.key}
              accessibilityRole="button"
              accessibilityLabel={suggestion.question}
              onPress={() => onSuggestion(suggestion.question)}
              className="min-h-14 gap-0.5 rounded-2xl border border-border bg-card px-4 py-3 active:bg-accent"
            >
              <Text className="text-[13px] font-semibold text-primary">{suggestion.label}</Text>
              <Text className="text-[13px] leading-5 text-muted-foreground">
                {suggestion.question}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-center text-sm text-destructive">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
