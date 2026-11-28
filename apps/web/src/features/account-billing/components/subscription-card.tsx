"use client";
import type * as React from "react";
import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatBillingDate, type AccountPlanView } from "../model";

/**
 * The plan the account holds today.
 *
 * A wallet purchase has no automatic renewal, so the card says when access
 * ends instead of implying another charge. A card subscription keeps its
 * portal, which is the only place its billing details can be changed.
 */
export function SubscriptionCard({
  view,
  portalPending,
  portalFailed,
  onPortal,
}: {
  view: AccountPlanView | null;
  portalPending: boolean;
  portalFailed: boolean;
  onPortal(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  const endsOn = view ? formatBillingDate(view.endsOn, locale) : null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <CardTitle as="h2">{t("planTitle")}</CardTitle>
            <CardDescription className="max-w-[45ch]">{t("planDescription")}</CardDescription>
          </div>
          {view ? <Badge variant="secondary">{t(view.statusKey)}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {view ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold tracking-tight">
                {view.plan?.name ?? view.subscription.planId}
              </p>
              <p className="text-sm text-muted-foreground">{t(view.periodKey)}</p>
            </div>
            {endsOn ? (
              <p className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{t("planEndsOn", { date: endsOn })}</span>
              </p>
            ) : null}
            <p className="text-sm leading-6 text-muted-foreground">
              {view.renews ? t("planRenews") : t("planNoRenewal")}
            </p>
            {portalFailed ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{t("portalError")}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" render={<Link href="/pricing" />} nativeButton={false}>
                {t("managePlan")}
              </Button>
              {view.canPortal ? (
                <Button variant="ghost" onClick={onPortal} disabled={portalPending}>
                  {t("openPortal")}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border px-4 py-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t("planNoneTitle")}</p>
              <p className="text-sm leading-6 text-muted-foreground">{t("planNoneDescription")}</p>
            </div>
            <Button className="w-fit" render={<Link href="/pricing" />} nativeButton={false}>
              {t("browsePlans")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
