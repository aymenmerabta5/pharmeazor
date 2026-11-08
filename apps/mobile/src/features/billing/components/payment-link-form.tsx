import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentLinkFormController } from "../types";
export interface PaymentLinkFormViewProps {
  readonly form: PaymentLinkFormController;
  readonly disabled: boolean;
  readonly nameLabel: string;
  readonly priceLabel: string;
  readonly submitLabel: string;
}
export function PaymentLinkFormView({
  form,
  disabled,
  nameLabel,
  priceLabel,
  submitLabel,
}: PaymentLinkFormViewProps): React.JSX.Element {
  return (
    <View className="gap-2">
      <form.Field name="name">
        {(field) => (
          <View>
            <Text className="text-sm font-medium">{nameLabel}</Text>
            <Input
              accessibilityLabel={nameLabel}
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
            />
          </View>
        )}
      </form.Field>
      <form.Field name="price">
        {(field) => (
          <View>
            <Text className="text-sm font-medium">{priceLabel}</Text>
            <Input
              accessibilityLabel={priceLabel}
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              autoCapitalize="none"
            />
          </View>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) =>
          errors.length ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {String(errors[0])}
            </Text>
          ) : null
        }
      </form.Subscribe>
      <Button variant="outline" disabled={disabled} onPress={() => void form.handleSubmit()}>
        <Text>{submitLabel}</Text>
      </Button>
    </View>
  );
}
