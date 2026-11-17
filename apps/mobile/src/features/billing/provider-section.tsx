import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ProviderCard } from "./components/provider-card";
import { PlanPicker } from "./components/plan-picker";
import { PaymentLinkSection } from "./payment-link-section";
import { selectedProviders, type CheckoutProviderName } from "./model";
import type { useBillingSnapshot } from "./use-billing-snapshot";
import type { useBillingActions } from "./use-billing-actions";
import type { useBillingPlanSelection } from "./use-billing-plan";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The hosted checkout rails.
 *
 * Billing and wallet show the same provider cards; keeping the composition in
 * one section means a new rail, plan rule, or admin payment link reaches both
 * screens without being copied.
 */
export function ProviderSection({
  snapshot,
  actions,
  planSelection,
  t,
}: {
  snapshot: ReturnType<typeof useBillingSnapshot>;
  actions: ReturnType<typeof useBillingActions>;
  planSelection: ReturnType<typeof useBillingPlanSelection>;
  t: NamespaceTranslate<"billing">;
}): React.JSX.Element {
  return (
    <View className="gap-3">
      {selectedProviders.map((provider) => {
        const checkoutProvider: CheckoutProviderName = provider.id;
        const planId = planSelection.planIdFor(checkoutProvider);
        return (
          <ProviderCard
            key={provider.id}
            provider={provider}
            description={t("providerDescription")}
            checkoutLabel={t("startCheckout")}
            portalLabel={t("openPortal")}
            disabled={!snapshot.isAuthenticated || actions.isPending || !planId}
            planPicker={
              <PlanPicker
                plans={snapshot.plans}
                provider={checkoutProvider}
                selectedPlanId={planId}
                onSelect={planSelection.selectPlan}
                disabled={!snapshot.isAuthenticated || actions.isPending}
                label={t("choosePlan")}
              />
            }
            onCheckout={() => {
              void actions.run({ kind: "checkout", provider: checkoutProvider, planId });
            }}
            onPortal={() => {
              void actions.run({ kind: "portal", provider: "stripe" });
            }}
            paymentLink={
              provider.paymentLink ? (
                snapshot.isAdmin ? (
                  <PaymentLinkSection
                    provider={provider.id}
                    disabled={actions.isPending}
                    submit={actions.submit}
                    planId={planId}
                  />
                ) : (
                  <Text className="text-xs text-muted-foreground">{t("adminPaymentLinks")}</Text>
                )
              ) : null
            }
          />
        );
      })}
    </View>
  );
}
