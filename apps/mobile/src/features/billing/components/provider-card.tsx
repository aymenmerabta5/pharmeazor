import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProviderOption } from "../model";
export interface ProviderCardProps {
  readonly provider: ProviderOption;
  readonly disabled: boolean;
  readonly description: string;
  readonly checkoutLabel: string;
  readonly portalLabel: string;
  readonly onCheckout: () => void;
  readonly onPortal: () => void;
  readonly paymentLink: React.ReactNode;
}
export function ProviderCard({
  provider,
  disabled,
  description,
  checkoutLabel,
  portalLabel,
  onCheckout,
  onPortal,
  paymentLink,
}: ProviderCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{provider.label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          <Button onPress={onCheckout} disabled={disabled}>
            <Text>{checkoutLabel}</Text>
          </Button>
          {provider.portal ? (
            <Button onPress={onPortal} disabled={disabled} variant="outline">
              <Text>{portalLabel}</Text>
            </Button>
          ) : null}
        </View>
        {paymentLink}
      </CardContent>
    </Card>
  );
}
