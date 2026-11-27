import type * as React from "react";
import { View } from "react-native";
import { LeafGlyph } from "@/components/brand-mark";
import { Text } from "@/components/ui/text";

/**
 * The first screen a signed-in user sees.
 *
 * One olive panel carries the greeting, the question, and the prompt. Below it
 * the page stays airy: suggestions are cards, and tools are pills. The panel is
 * the only loud surface, so the prompt remains the obvious next action.
 */
export function HomeHero({
  greeting,
  title,
  description,
  prompt,
}: {
  greeting: string;
  title: string;
  description: string;
  prompt: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="overflow-hidden rounded-[28px] bg-mark p-5">
      <View
        pointerEvents="none"
        className="absolute -end-12 -top-16 size-48 rounded-full bg-mark-foreground/10"
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-20 -start-14 size-44 rounded-full bg-mark-foreground/5"
      />
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <View className="size-11 items-center justify-center rounded-2xl bg-mark-foreground/15">
            <LeafGlyph size={20} toneClassName="bg-mark-foreground" />
          </View>
          <Text className="text-sm font-medium text-hero-muted">{greeting}</Text>
        </View>
        <Text
          accessibilityRole="header"
          className="text-[26px] font-semibold leading-8 tracking-tight text-mark-foreground"
        >
          {title}
        </Text>
        <Text className="text-sm leading-6 text-hero-muted">{description}</Text>
        {prompt}
      </View>
    </View>
  );
}
