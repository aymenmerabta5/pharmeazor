"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatManualAmount, type ManualPayment } from "../model";
import type { PaymentReviewState } from "../types";
import { ManualReviewDecision } from "./review-decision";

export function ManualReviewRowView({
  item,
  state,
  receipt,
}: {
  item: ManualPayment;
  state: PaymentReviewState;
  receipt: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const { resolved, decision, choose } = state;
  const amount = formatManualAmount(item.amountMinor, locale);
  return (
    <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium tabular-nums">{amount}</span>
          <span className="break-all text-sm text-muted-foreground">
            {t("manualAccount")}: {item.ownerId}
          </span>
          <span className="text-sm text-muted-foreground">
            <bdi>{item.method}</bdi> ·{" "}
            <time dateTime={item.createdAt}>
              <bdi>{new Date(item.createdAt).toLocaleString(locale)}</bdi>
            </time>
          </span>
          {item.reference ? (
            <span className="break-words text-sm">
              {t("manualReference")}: <bdi>{item.reference}</bdi>
            </span>
          ) : null}
        </div>
        <Badge variant="outline">
          {resolved === "approved"
            ? t("manualApproved")
            : resolved === "rejected"
              ? t("manualRejected")
              : t("manualPending")}
        </Badge>
      </div>
      {receipt}
      {resolved ? (
        <p role="status" className="text-sm">
          {t("manualReviewSaved")}
        </p>
      ) : decision ? (
        <ManualReviewDecision state={state} amount={amount} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => choose("approved")}>
            {t("manualApprove")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => choose("rejected")}>
            {t("manualReject")}
          </Button>
        </div>
      )}
    </li>
  );
}
