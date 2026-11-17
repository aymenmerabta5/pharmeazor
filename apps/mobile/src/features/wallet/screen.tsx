import * as React from "react";
import { useRouter } from "expo-router";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
import { useBillingSnapshot } from "@/features/billing/use-billing-snapshot";
import { useBillingActions } from "@/features/billing/use-billing-actions";
import { useBillingPlanSelection } from "@/features/billing/use-billing-plan";
import { ProviderSection } from "@/features/billing/provider-section";
import { SubscriptionsCard } from "@/features/billing/components/subscriptions-card";
import { InvoicesCard } from "@/features/billing/components/invoices-card";
import { formatBillingSubscriptionStatus } from "@/features/billing/status-labels";
import { ManualMobilePayments } from "@/features/manual-payments/screen";
import { useManualPayments } from "@/features/manual-payments/use-manual-payments";
import { WalletView } from "./components/wallet-view";
import {
  formatWalletAmount,
  formatWalletDate,
  selectPlan,
  selectPrimarySubscription,
} from "./model";

export function WalletScreen(): React.JSX.Element {
  const t = useTranslations("wallet");
  const billingT = useTranslations("billing");
  const locale = usePlatformI18n().locale;
  const router = useRouter();
  const snapshot = useBillingSnapshot();
  const payments = useManualPayments();
  const actions = useBillingActions(snapshot.refresh);
  const planSelection = useBillingPlanSelection(snapshot.plans);

  const subscription = selectPrimarySubscription(snapshot.subscriptions);
  const plan = selectPlan(subscription, snapshot.plans);
  const balanceMinor = payments.summary.data?.balanceMinor;
  const periodEnd = formatWalletDate(subscription?.currentPeriodEnd, locale);

  function refresh(): void {
    snapshot.refresh();
    payments.refresh();
  }

  return (
    <WalletView
      balanceAmount={balanceMinor === undefined ? null : formatWalletAmount(balanceMinor, locale)}
      balancePending={payments.summary.isPending}
      balanceError={Boolean(payments.summary.error)}
      plan={plan}
      subscription={subscription}
      statusLabel={
        subscription ? formatBillingSubscriptionStatus(subscription.status, billingT) : null
      }
      periodEnd={periodEnd ? t("planUntil", { date: periodEnd }) : null}
      manualPayments={
        <ManualMobilePayments
          showBalance={false}
          copyOverride={{ title: t("manualTitle"), description: t("manualDescription") }}
        />
      }
      providerControls={
        <ProviderSection
          snapshot={snapshot}
          actions={actions}
          planSelection={planSelection}
          t={billingT}
        />
      }
      subscriptionsCard={
        <SubscriptionsCard
          subscriptions={snapshot.subscriptions}
          isPending={snapshot.isPending}
          readError={snapshot.readError}
          t={billingT}
        />
      }
      invoicesCard={
        <InvoicesCard
          invoices={snapshot.invoices}
          isPending={snapshot.isPending}
          readError={snapshot.readError}
          locale={locale}
          t={billingT}
        />
      }
      isAuthenticated={snapshot.isAuthenticated}
      readError={Boolean(snapshot.readError)}
      refreshing={
        snapshot.isRefreshing || payments.summary.isFetching || payments.history.isFetching
      }
      onRefresh={refresh}
      onManagePlan={() => router.push("/billing")}
      t={t}
    />
  );
}
