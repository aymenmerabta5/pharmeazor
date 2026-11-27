import type * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The signed-in account strip above the conversation.
 *
 * It states who is asking and which plan is paying for the answer, and the
 * whole strip opens billing so the plan is never more than one tap away.
 */
export function AgentAccountBar({
  initials,
  name,
  email,
  planName,
  onManagePlan,
  t,
}: {
  initials: string;
  name: string | null;
  email: string | null;
  planName: string | null;
  onManagePlan(): void;
  t: NamespaceTranslate<"agent">;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("account")}
      onPress={onManagePlan}
      className="flex-row items-center gap-3 border-b border-border bg-background px-4 py-2.5 active:bg-accent"
    >
      <View className="size-9 items-center justify-center rounded-full bg-secondary">
        <Text className="text-[11px] font-bold text-secondary-foreground">{initials}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium" numberOfLines={1}>
          {name ?? email ?? t("pharmacist")}
        </Text>
        {name && email ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
      </View>
      <View className="rounded-full bg-secondary px-2.5 py-1">
        <Text className="text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
          {planName ? t("planBadge", { plan: planName }) : t("freePlan")}
        </Text>
      </View>
    </Pressable>
  );
}
