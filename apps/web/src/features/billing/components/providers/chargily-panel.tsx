"use client";
import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { WalletIcon } from "../icons";
import { Spinner } from "@/components/ui/spinner";
import type { BillingPageState } from "../../types";
import { useSurfaceTranslations } from "@/lib/translations";
import { BillingPlanPicker } from "../plan-picker";
import { BillingSubscriptionTable } from "../subscription-table";

export function ChargilyPanel({
  billing,
  paymentLink,
}: {
  billing: BillingPageState;
  paymentLink: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const {
    subscriptions,
    plans,
    selectedPlanId,
    selectPlan,
    subsLoading,
    isCheckoutLoading,
    handleCheckout,
  } = billing;
  const chargilySubs = subscriptions.filter((s) => s.provider === "chargily");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle as="h2">{t("chargilyTitle")}</CardTitle>
            <CardDescription className="max-w-[65ch]">{t("chargilyDescription")}</CardDescription>
          </div>
          <Badge variant="secondary">chargily</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Alert>
          <AlertTitle>{t("algeriaMarketTitle")}</AlertTitle>
          <AlertDescription className="max-w-[70ch]">
            {t("algeriaMarketDescription")}
          </AlertDescription>
        </Alert>
        <Alert>
          <AlertTitle>{t("serverOnlyTitle")}</AlertTitle>
          <AlertDescription className="max-w-[70ch]">
            {t("chargilyServerDescription")}
          </AlertDescription>
        </Alert>
        <BillingPlanPicker
          plans={plans}
          provider="chargily"
          selectedPlanId={selectedPlanId}
          onSelect={selectPlan}
          disabled={isCheckoutLoading}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handleCheckout("chargily", selectedPlanId ?? "")}
            disabled={isCheckoutLoading || !selectedPlanId}
          >
            {isCheckoutLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <WalletIcon data-icon="inline-start" />
            )}
            {t("checkout")}
          </Button>
        </div>
        {paymentLink}
        <BillingSubscriptionTable
          subscriptions={chargilySubs}
          plans={plans}
          loading={subsLoading}
        />
        <p className="text-xs text-muted-foreground max-w-[70ch]">{t("securityNote")}</p>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground">
        <p className="max-w-[70ch]">{t("chargilyFlowDescription")}</p>
      </CardFooter>
    </Card>
  );
}
