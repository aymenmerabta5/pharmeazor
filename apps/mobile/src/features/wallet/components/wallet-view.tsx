import type * as React from "react";
import { useRef } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { PlanView, SubscriptionView } from "@/features/billing/model";
import { WalletAccountSections } from "./wallet-account-sections";
import { WalletHeader } from "./wallet-header";
import { WalletHero } from "./wallet-hero";
import { WalletPlanCard } from "./wallet-plan-card";
import type { NamespaceTranslate } from "@/lib/i18n";

/**
 * The wallet page scaffold.
 *
 * The hero owns the balance, the plan strip answers the subscription question,
 * and every later block is a section with one responsibility. The top-up and
 * plan actions scroll to their section rather than opening another screen, so
 * a phone user never loses the balance they were looking at.
 */
export function WalletView({
  balanceAmount,
  balancePending,
  balanceError,
  plan,
  subscription,
  statusLabel,
  periodEnd,
  manualPayments,
  providerControls,
  subscriptionsCard,
  invoicesCard,
  isAuthenticated,
  readError,
  refreshing,
  onRefresh,
  onManagePlan,
  t,
}: {
  balanceAmount: string | null;
  balancePending: boolean;
  balanceError: boolean;
  plan: PlanView | null;
  subscription: SubscriptionView | null;
  statusLabel: string | null;
  periodEnd: string | null;
  manualPayments: React.ReactNode;
  providerControls: React.ReactNode;
  subscriptionsCard: React.ReactNode;
  invoicesCard: React.ReactNode;
  isAuthenticated: boolean;
  readError: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onManagePlan: () => void;
  t: NamespaceTranslate<"wallet">;
}): React.JSX.Element {
  const scrollRef = useRef<ScrollView | null>(null);
  const topUpOffset = useRef(0);
  const plansOffset = useRef(0);

  function scrollTo(offset: number): void {
    scrollRef.current?.scrollTo({ y: offset, animated: true });
  }

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pb-8 pt-4"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <WalletHeader t={t} />

      {!isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("signInRequired")}</CardTitle>
            <CardDescription>{t("signInDescription")}</CardDescription>
          </CardHeader>
          <View className="px-5">
            <Link href="/auth/sign-in" asChild>
              <Button>
                <Text>{t("signIn")}</Text>
              </Button>
            </Link>
          </View>
        </Card>
      ) : (
        <>
          <WalletHero
            balanceLabel={t("balanceLabel")}
            amount={balanceAmount}
            pending={balancePending}
            unavailable={t("dataUnavailable")}
            error={balanceError}
            description={t("balanceDescription")}
            topUpLabel={t("topUp")}
            browsePlansLabel={t("browsePlans")}
            onTopUp={() => scrollTo(topUpOffset.current)}
            onBrowsePlans={() => scrollTo(plansOffset.current)}
          />
          {readError ? (
            <Alert variant="destructive" accessibilityRole="alert">
              <AlertDescription>{t("dataUnavailable")}</AlertDescription>
            </Alert>
          ) : null}
          <WalletPlanCard
            title={t("planTitle")}
            plan={plan}
            subscription={subscription}
            statusLabel={statusLabel}
            periodEnd={periodEnd}
            renewsLabel={t("planRenews")}
            noRenewalLabel={t("planNoRenewal")}
            noPlanTitle={t("noPlanTitle")}
            noPlanDescription={t("noPlanDescription")}
            actionLabel={plan ? t("managePlan") : t("browsePlans")}
            onAction={() => (plan ? onManagePlan() : scrollTo(plansOffset.current))}
          />
          <WalletAccountSections
            manualPayments={manualPayments}
            providerControls={providerControls}
            subscriptionsCard={subscriptionsCard}
            invoicesCard={invoicesCard}
            onTopUpLayout={(offset) => {
              topUpOffset.current = offset;
            }}
            onPlansLayout={(offset) => {
              plansOffset.current = offset;
            }}
            t={t}
          />
        </>
      )}

      <Button variant="outline" disabled={refreshing} onPress={onRefresh}>
        <Text>{t("refresh")}</Text>
      </Button>
    </ScrollView>
  );
}
