import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { LeafGlyph } from "@/components/brand-mark";
import { Text } from "@/components/ui/text";
import type { ChatMessage } from "../model";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The running conversation.
 *
 * User turns are solid olive pills aligned to the end; assistant turns keep the
 * leaf beside a bordered card so the reader can tell who is speaking without
 * reading the text first. The list follows streaming text and stays polite for
 * screen readers.
 */
export function AgentConversation({
  messages,
  pending,
  error,
  scrollRef,
  t,
}: {
  messages: readonly ChatMessage[];
  pending: boolean;
  error: string | null;
  scrollRef: React.RefObject<ScrollView | null>;
  t: NamespaceTranslate<"agent">;
}): React.JSX.Element {
  return (
    <ScrollView
      ref={scrollRef}
      accessibilityLabel={t("conversationLabel")}
      accessibilityLiveRegion="polite"
      className="flex-1"
      contentContainerClassName="gap-3 px-4 py-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <View key={message.id} className="max-w-[85%] self-end rounded-3xl bg-primary px-4 py-3">
            <Text className="text-[15px] leading-6 text-primary-foreground">{message.text}</Text>
          </View>
        ) : (
          <View key={message.id} className="max-w-[92%] flex-row items-start gap-2 self-start">
            <View className="mt-0.5 size-7 items-center justify-center rounded-full bg-secondary">
              <LeafGlyph size={13} toneClassName="bg-primary" />
            </View>
            <View className="flex-1 rounded-3xl border border-border bg-card px-4 py-3">
              <Text className="text-[15px] leading-6 text-foreground">{message.text}</Text>
            </View>
          </View>
        ),
      )}
      {pending ? <TypingBubble label={t("working")} /> : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function TypingBubble({ label }: { label: string }): React.JSX.Element {
  return (
    <View className="max-w-[92%] flex-row items-start gap-2 self-start">
      <View className="mt-0.5 size-7 items-center justify-center rounded-full bg-secondary">
        <LeafGlyph size={13} toneClassName="bg-primary" />
      </View>
      <View className="flex-row items-center gap-2 rounded-3xl border border-border bg-card px-4 py-3">
        <ActivityIndicator size="small" />
        <Text className="text-sm text-muted-foreground">{label}</Text>
      </View>
    </View>
  );
}
