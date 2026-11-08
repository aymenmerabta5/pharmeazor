import * as React from "react";
import { Text } from "@/components/ui/text";
import { BillingView } from "./components/billing-view";
import { ProviderCard } from "./components/provider-card";
import { PaymentLinkSection } from "./payment-link-section";
import { useBillingSnapshot } from "./use-billing-snapshot";
import { useBillingActions } from "./use-billing-actions";
import { selectedProviders } from "./model";
import { ManualMobilePayments } from "@/features/manual-payments/screen";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
export function BillingScreen(): React.JSX.Element {
  const t = useTranslations("billing");
  const locale = usePlatformI18n().locale;
  const snapshot = useBillingSnapshot();
  const actions = useBillingActions(snapshot.refresh);
  const providerControls = selectedProviders.map((provider) => (
    <ProviderCard
      key={provider.id}
      provider={provider}
      description={t("providerDescription")}
      checkoutLabel={t("startCheckout")}
      portalLabel={t("openPortal")}
      disabled={!snapshot.isAuthenticated || actions.isPending}
      onCheckout={() => {
        void actions.run({ kind: "checkout", provider: provider.id });
      }}
      onPortal={() => {
        void actions.run({ kind: "portal", provider: provider.id });
      }}
      paymentLink={
        provider.paymentLink ? (
          snapshot.isAdmin ? (
            <PaymentLinkSection
              provider={provider.id}
              disabled={actions.isPending}
              submit={actions.submit}
            />
          ) : (
            <Text className="text-xs text-muted-foreground">{t("adminPaymentLinks")}</Text>
          )
        ) : null
      }
    />
  ));
  return (
    <BillingView
      {...snapshot}
      locale={locale}
      onRefresh={snapshot.refresh}
      actionError={actions.error ? t("checkoutError") : null}
      providerControls={providerControls}
      manualPayments={<ManualMobilePayments />}
      t={t}
    />
  );
}
