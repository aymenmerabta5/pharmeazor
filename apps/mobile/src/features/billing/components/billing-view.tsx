import * as React from "react";
import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SubscriptionsCard } from "./subscriptions-card";
import { InvoicesCard } from "./invoices-card";
import type { InvoiceView, SubscriptionView } from "../model";
import type { NamespaceTranslate } from "@/lib/i18n";
export interface BillingViewProps {
  readonly subscriptions: readonly SubscriptionView[];
  readonly invoices: readonly InvoiceView[];
  readonly locale: string;
  readonly isAuthenticated: boolean;
  readonly isPending: boolean;
  readonly isRefreshing: boolean;
  readonly readError: Error | null;
  readonly actionError: string | null;
  readonly onRefresh: () => void;
  readonly providerControls: React.ReactNode;
  readonly manualPayments: React.ReactNode;
  readonly t: NamespaceTranslate<"billing">;
}
export function BillingView({
  subscriptions,
  invoices,
  locale,
  isAuthenticated,
  isPending,
  isRefreshing,
  readError,
  actionError,
  onRefresh,
  providerControls,
  manualPayments,
  t,
}: BillingViewProps): React.JSX.Element {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-[960px] self-center gap-5 p-5">
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <Text className="text-2xl font-bold tracking-tight">{t("title")}</Text>
            <Text className="text-sm text-muted-foreground">{t("mobileDescription")}</Text>
          </View>
          <Link href="/dashboard" asChild>
            <Button variant="outline">
              <Text>{t("dashboard")}</Text>
            </Button>
          </Link>
        </View>
        {actionError ? (
          <Alert variant="destructive" accessibilityRole="alert">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}
        {readError ? (
          <Alert variant="destructive" accessibilityRole="alert">
            <AlertDescription>{t("dataUnavailable")}</AlertDescription>
          </Alert>
        ) : null}
        {!isAuthenticated ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("signInRequired")}</CardTitle>
              <CardDescription>{t("signInDescription")}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {manualPayments}
        <View className="gap-3">{providerControls}</View>
        <SubscriptionsCard
          subscriptions={subscriptions}
          isPending={isPending}
          readError={readError}
          t={t}
        />
        <InvoicesCard
          invoices={invoices}
          isPending={isPending}
          readError={readError}
          locale={locale}
          t={t}
        />
        <Button
          variant="outline"
          disabled={!isAuthenticated || isRefreshing}
          onPress={() => void onRefresh()}
        >
          <Text>{t("refresh")}</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
