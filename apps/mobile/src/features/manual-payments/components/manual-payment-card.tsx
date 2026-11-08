import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { ManualSummary, ManualPayment, ManualPaymentCopy } from "../types";
export interface ManualPaymentCardProps {
  readonly copy: ManualPaymentCopy;
  readonly locale: string;
  readonly summary?: ManualSummary;
  readonly items?: readonly ManualPayment[];
  readonly summaryPending: boolean;
  readonly historyPending: boolean;
  readonly readError: boolean;
  readonly historyError: boolean;
  readonly refreshDisabled: boolean;
  readonly opening: boolean;
  readonly openError: boolean;
  readonly onRefresh: () => void;
  readonly onOpen: () => Promise<void>;
}
export function ManualPaymentCard({
  copy,
  locale,
  summary,
  items,
  summaryPending,
  historyPending,
  readError,
  historyError,
  refreshDisabled,
  opening,
  openError,
  onRefresh,
  onOpen,
}: ManualPaymentCardProps): React.JSX.Element {
  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "DZD" }).format(minor / 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {readError ? (
          <Alert variant="destructive" accessibilityRole="alert">
            <AlertDescription>{copy.readFailed}</AlertDescription>
          </Alert>
        ) : null}
        {summaryPending ? <ActivityIndicator accessibilityLabel={copy.loading} /> : null}
        {summary ? (
          <>
            <View className="gap-1">
              <Text className="text-sm text-muted-foreground">{copy.balance}</Text>
              <Text className="text-3xl font-semibold">{money(summary.balanceMinor)}</Text>
              <Text className="text-sm text-muted-foreground">{copy.balanceHelp}</Text>
            </View>
            {summary.enabled ? (
              <>
                <Text className="text-sm leading-6">{summary.receiverInstructions}</Text>
                <Text className="text-sm text-muted-foreground">{copy.webHelp}</Text>
                <Button disabled={opening} onPress={() => void onOpen()}>
                  <Text>{copy.openWeb}</Text>
                </Button>
              </>
            ) : (
              <Text className="text-sm text-muted-foreground">{copy.unavailable}</Text>
            )}
          </>
        ) : null}
        {openError ? (
          <Alert variant="destructive" accessibilityRole="alert">
            <AlertDescription>{copy.webUnavailable}</AlertDescription>
          </Alert>
        ) : null}
        <Text className="text-base font-semibold">{copy.history}</Text>
        {historyPending ? (
          <ActivityIndicator accessibilityLabel={copy.loading} />
        ) : items?.length === 0 && !historyError ? (
          <Text className="text-sm text-muted-foreground">{copy.empty}</Text>
        ) : (
          items?.map((item) => (
            <View key={item.id} className="gap-2 border-b border-border py-3">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="font-medium">{money(item.amountMinor)}</Text>
                <Badge variant={item.status === "rejected" ? "destructive" : "secondary"}>
                  <Text>
                    {item.status === "approved"
                      ? copy.approved
                      : item.status === "rejected"
                        ? copy.rejected
                        : copy.pending}
                  </Text>
                </Badge>
              </View>
              <View
                accessible
                accessibilityLabel={
                  item.method + " · " + new Date(item.createdAt).toLocaleDateString(locale)
                }
                style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}
              >
                <Text
                  accessible={false}
                  className="text-sm text-muted-foreground"
                  style={{ flexShrink: 1, maxWidth: "100%" }}
                >
                  {item.method}
                </Text>
                <Text accessible={false} className="text-sm text-muted-foreground">
                  {" · "}
                </Text>
                <Text
                  accessible={false}
                  className="text-sm text-muted-foreground"
                  style={{ flexShrink: 1, maxWidth: "100%" }}
                >
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </Text>
              </View>
              {item.reason ? <Text className="text-sm">{item.reason}</Text> : null}
            </View>
          ))
        )}
        <Button variant="outline" disabled={refreshDisabled} onPress={onRefresh}>
          <Text>{copy.refresh}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
