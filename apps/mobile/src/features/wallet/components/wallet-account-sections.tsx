import type * as React from "react";
import { View } from "react-native";
import { WalletSectionHeading } from "./wallet-section-heading";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The account tools under the balance.
 *
 * Top-up, hosted checkout, subscriptions, and invoices each keep their own
 * card; this section only spaces them and reports the two offsets the hero
 * actions scroll to. Splitting it from the scaffold keeps the wallet page a
 * composition instead of one long screen.
 */
export function WalletAccountSections({
  manualPayments,
  providerControls,
  subscriptionsCard,
  invoicesCard,
  onTopUpLayout,
  onPlansLayout,
  t,
}: {
  manualPayments: React.ReactNode;
  providerControls: React.ReactNode;
  subscriptionsCard: React.ReactNode;
  invoicesCard: React.ReactNode;
  onTopUpLayout: (offset: number) => void;
  onPlansLayout: (offset: number) => void;
  t: NamespaceTranslate<"wallet">;
}): React.JSX.Element {
  return (
    <>
      <View className="gap-3" onLayout={(event) => onTopUpLayout(event.nativeEvent.layout.y)}>
        {manualPayments}
      </View>
      <View className="gap-3" onLayout={(event) => onPlansLayout(event.nativeEvent.layout.y)}>
        <WalletSectionHeading title={t("providersTitle")} description={t("providersDescription")} />
        {providerControls}
      </View>
      <View className="gap-3">
        <WalletSectionHeading title={t("subscriptionsTitle")} />
        {subscriptionsCard}
      </View>
      <View className="gap-3">
        <WalletSectionHeading title={t("invoicesTitle")} />
        {invoicesCard}
      </View>
    </>
  );
}
