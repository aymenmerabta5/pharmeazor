"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSurfaceTranslations } from "@/lib/translations";
import { formatBillingSubscriptionStatus } from "../status-labels";
import type { Plan, Sub } from "../types";

/**
 * The subscriptions of one rail.
 *
 * Every column is about the same subscription: which plan it grants, which
 * rail pays for it, when it runs out, and whether it renews by itself.
 */
export function BillingSubscriptionTable({
  subscriptions,
  plans,
  loading,
}: {
  subscriptions: Sub[];
  plans: Plan[];
  loading: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const planName = (planId: string): string =>
    plans.find((plan) => plan.id === planId)?.name ?? planId;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("subscriptions")}</h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : subscriptions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle className="text-sm">{t("noSubscriptionsTitle")}</EmptyTitle>
            <EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("plan")}</TableHead>
              <TableHead>{t("provider")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("periodEnd")}</TableHead>
              <TableHead>{t("renewsAutomatically")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((subscription) => (
              <TableRow key={subscription.id}>
                <TableCell className="font-medium">{planName(subscription.planId)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{subscription.provider}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      subscription.status === "active"
                        ? "secondary"
                        : subscription.status === "past_due"
                          ? "destructive"
                          : "outline"
                    }
                    className="capitalize"
                  >
                    {formatBillingSubscriptionStatus(subscription.status, t)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {subscription.autoRenew
                    ? t("renews", {
                        date: subscription.currentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString()
                          : "",
                      })
                    : t("manualRenewal")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
