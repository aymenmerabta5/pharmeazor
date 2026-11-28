import type * as React from "react";
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvoiceView } from "../model";
import { formatBillingInvoiceStatus } from "../status-labels";
import { formatBillingInvoiceAmount } from "@/lib/billing-money";
import type { NamespaceTranslate } from "@/lib/i18n";
export function InvoicesCard({
  invoices,
  isPending,
  readError,
  locale,
  t,
}: {
  invoices: readonly InvoiceView[];
  isPending: boolean;
  readError: Error | null;
  locale: string;
  t: NamespaceTranslate<"billing">;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invoices")}</CardTitle>
        <CardDescription>{t("invoiceDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2">
        {isPending ? (
          <>
            {[0, 1].map((index) => (
              <View
                key={index}
                className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </View>
            ))}
          </>
        ) : invoices.length === 0 ? (
          readError ? null : (
            <Text className="text-sm text-muted-foreground">{t("noInvoices")}</Text>
          )
        ) : (
          invoices.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <Text className="text-sm">
                {item.provider} · {formatBillingInvoiceAmount(item, locale)}
              </Text>
              <Badge variant={item.paid ? "secondary" : "destructive"}>
                <Text className="text-xs">{formatBillingInvoiceStatus(item.status, t)}</Text>
              </Badge>
            </View>
          ))
        )}
      </CardContent>
    </Card>
  );
}
