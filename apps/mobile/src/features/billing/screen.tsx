import * as React from "react";
import { BillingView } from "./components/billing-view";
import { ProviderSection } from "./provider-section";
import { useBillingSnapshot } from "./use-billing-snapshot";
import { useBillingActions } from "./use-billing-actions";
import { useBillingPlanSelection } from "./use-billing-plan";
import { ManualMobilePayments } from "@/features/manual-payments/screen";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";

export function BillingScreen(): React.JSX.Element {
  const t = useTranslations("billing");
  const locale = usePlatformI18n().locale;
  const snapshot = useBillingSnapshot();
  const actions = useBillingActions(snapshot.refresh);
  const planSelection = useBillingPlanSelection(snapshot.plans);
  return (
    <BillingView
      {...snapshot}
      locale={locale}
      onRefresh={snapshot.refresh}
      actionError={actions.error ? t("checkoutError") : null}
      providerControls={
        <ProviderSection
          snapshot={snapshot}
          actions={actions}
          planSelection={planSelection}
          t={t}
        />
      }
      manualPayments={<ManualMobilePayments />}
      t={t}
    />
  );
}
