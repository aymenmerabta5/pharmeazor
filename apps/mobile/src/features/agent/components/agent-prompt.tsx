import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { NativeFormField } from "@/components/form-fields/native-field";
import { Button } from "@/components/ui/button";
import type { AgentPromptForm } from "../use-agent-prompt";
export function AgentPromptView({
  form,
  pending,
  label,
  placeholder,
  working,
  submitLabel,
}: {
  form: AgentPromptForm;
  pending: boolean;
  label: string;
  placeholder: string;
  working: string;
  submitLabel: string;
}): React.JSX.Element {
  return (
    <View className="gap-2">
      <form.Field name="message">
        {(field) => (
          <NativeFormField
            label={label}
            value={field.state.value}
            placeholder={placeholder}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            disabled={pending}
            maxLength={65536}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => Boolean(state.values.message.trim())}>
        {(hasMessage) => (
          <Button disabled={pending || !hasMessage} onPress={() => void form.handleSubmit()}>
            <Text>{pending ? working : submitLabel}</Text>
          </Button>
        )}
      </form.Subscribe>
    </View>
  );
}
