import type * as React from "react";
import { View } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { firstFormError } from "@/components/form-fields/native-field";
import type { AgentPromptForm } from "../use-agent-prompt";

/**
 * The assistant composer.
 *
 * A rounded field and a 40 px send control sit in one row above the keyboard.
 * The visible label belongs to the empty state, so the input carries its label
 * for assistive technology instead of repeating it over the field.
 */
export function AgentPromptView({
  form,
  pending,
  label,
  placeholder,
  working,
  submitLabel,
  rtl,
}: {
  form: AgentPromptForm;
  pending: boolean;
  label: string;
  placeholder: string;
  working: string;
  submitLabel: string;
  rtl: boolean;
}): React.JSX.Element {
  return (
    <form.Field name="message">
      {(field) => {
        const error = firstFormError(field.state.meta.errors);
        return (
          <View className="gap-1.5">
            <View className="flex-row items-end gap-1.5 rounded-[24px] border border-input bg-card p-1.5 ps-4">
              <Input
                accessibilityLabel={label}
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                placeholder={pending ? working : placeholder}
                editable={!pending}
                multiline
                maxLength={65536}
                className="min-h-10 flex-1 border-0 bg-transparent px-0 py-2.5 text-[15px]"
              />
              <form.Subscribe selector={(state) => Boolean(state.values.message.trim())}>
                {(hasMessage) => (
                  <Button
                    size="icon"
                    accessibilityLabel={submitLabel}
                    isLoading={pending}
                    disabled={pending || !hasMessage}
                    onPress={() => void form.handleSubmit()}
                    className="size-10"
                  >
                    {pending ? null : (
                      <Text
                        className="text-lg font-semibold text-primary-foreground"
                        style={{ transform: [{ rotate: rtl ? "-45deg" : "45deg" }] }}
                      >
                        ↑
                      </Text>
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </View>
            {error ? (
              <Text accessibilityRole="alert" className="px-2 text-sm text-destructive">
                {error}
              </Text>
            ) : null}
          </View>
        );
      }}
    </form.Field>
  );
}
