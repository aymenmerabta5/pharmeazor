"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { ManualReviewQueue } from "./components/review-queue";
import { ManualReviewRow } from "./payment-review";
import { useManualReviewQueue, useManualSummary } from "./queries";

/**
 * The administrator's transfer review queue.
 *
 * Approving a receipt credits the wallet inside the review transaction, so this
 * view is the whole manual fulfilment path: no second grant step exists to
 * forget. The customer spends the balance on a plan afterwards.
 */
export function ManualAdminQueue(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const summary = useManualSummary();
  const canReview = summary.data?.canReview === true;
  const queue = useManualReviewQueue(canReview);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <CardTitle as="h1">{t("manualQueue")}</CardTitle>
            <CardDescription className="max-w-[65ch]">
              {t("manualQueueDescription")}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={queue.isFetching}
            aria-busy={queue.isFetching}
            onClick={() => void queue.refetch()}
          >
            {t("refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.error || queue.error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t("manualQueueFailed")}</AlertDescription>
          </Alert>
        ) : null}
        {!summary.data && summary.isPending ? (
          <Skeleton className="h-48 w-full" aria-label={t("manualLoading")} />
        ) : null}
        {summary.data && !canReview ? (
          <Alert>
            <AlertDescription>{t("manualQueueHelp")}</AlertDescription>
          </Alert>
        ) : null}
        {queue.isPending && !queue.data ? (
          <Skeleton className="h-48 w-full" aria-label={t("manualQueueLoading")} />
        ) : null}
        {queue.data ? (
          <ManualReviewQueue empty={queue.data.items.length === 0}>
            {queue.data.items.map((item) => (
              <ManualReviewRow key={item.id} item={item} />
            ))}
          </ManualReviewQueue>
        ) : null}
      </CardContent>
    </Card>
  );
}
