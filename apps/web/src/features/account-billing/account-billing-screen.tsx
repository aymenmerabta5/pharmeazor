"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { accountPlanView, type AccountBillingSnapshot } from "./model";
import { useAccountPortal } from "./use-account-portal";
import { BalanceHero } from "./components/balance-hero";
import { SubscriptionCard } from "./components/subscription-card";
import { TopupHistory } from "./components/topup-history";
import { TopupSection } from "./components/topup-section";

/**
 * The account billing surface.
 *
 * The balance and the plan arrive from the server, because both are account
 * data that must not flash or come from a second read. The transfer form and
 * its history load behind their own boundary.
 */
export function AccountBillingScreen({
  snapshot,
  balanceMinor,
}: {
  snapshot: AccountBillingSnapshot;
  balanceMinor: number;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const view = accountPlanView(snapshot);
  const portal = useAccountPortal();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </header>
      <BalanceHero balanceMinor={balanceMinor} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <SubscriptionCard
          view={view}
          portalPending={portal.pending}
          portalFailed={portal.failed}
          onPortal={() => void portal.open()}
        />
        <TopupSection />
      </div>
      <TopupHistory />
    </div>
  );
}
