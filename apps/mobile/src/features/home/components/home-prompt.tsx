import type * as React from "react";
import { Pressable, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type { HomePromptForm } from "../use-home-prompt";

/**
 * The home prompt pill.
 *
 * One line, one action, the full width of the panel. The send control is a
 * 40 px circle inside the pill so the whole row stays a single thumb target.
 */
export function HomePrompt({
  form,
  label,
  placeholder,
  sendLabel,
  rtl,
  onSend,
}: {
  form: HomePromptForm;
  label: string;
  placeholder: string;
  sendLabel: string;
  rtl: boolean;
  onSend: () => void;
}): React.JSX.Element {
  return (
    <View className="mt-1 flex-row items-center gap-1.5 rounded-full bg-card p-1.5 ps-4">
      <form.Field name="message">
        {(field) => (
          <Input
            accessibilityLabel={label}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            placeholder={placeholder}
            returnKeyType="send"
            onSubmitEditing={onSend}
            maxLength={65536}
            className="h-11 flex-1 border-0 bg-transparent px-0 text-[15px]"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => Boolean(state.values.message.trim())}>
        {(hasMessage) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: !hasMessage }}
            disabled={!hasMessage}
            onPress={onSend}
            className={
              hasMessage
                ? "size-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
                : "size-10 items-center justify-center rounded-full bg-muted"
            }
          >
            <Text
              className={
                hasMessage
                  ? "text-lg font-semibold text-primary-foreground"
                  : "text-lg font-semibold text-muted-foreground"
              }
              style={{ transform: [{ rotate: rtl ? "-45deg" : "45deg" }] }}
            >
              ↑
            </Text>
          </Pressable>
        )}
      </form.Subscribe>
    </View>
  );
}
