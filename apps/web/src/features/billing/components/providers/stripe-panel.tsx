"use client";
import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useSurfaceTranslations } from "@/lib/translations";
import { CopyIcon, CreditCardIcon, ExternalLinkIcon } from "../icons";
import { StripeInvoices } from "./stripe-invoices";
import { BillingPlanPicker } from "../plan-picker";
import { BillingSubscriptionTable } from "../subscription-table";
import type { BillingPageState } from "../../types";

export function StripePanel({ billing }: { billing: BillingPageState }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const {
    subscriptions,
    invoices,
    plans,
    selectedPlanId,
    selectPlan,
    subsLoading,
    isCheckoutLoading,
    pastDue,
    handleCheckout,
    handlePortal,
    copySuccessUrl,
  } = billing;
  const stripeSubs = subscriptions.filter((subscription) => subscription.provider === "stripe");
  const stripeInvs = invoices.filter((invoice) => invoice.provider === "stripe");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle as="h2">{t("stripeTitle")}</CardTitle>
            <CardDescription className="max-w-[65ch]">{t("stripeDescription")}</CardDescription>
          </div>
          <Badge variant="secondary">stripe</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <BillingPlanPicker
          plans={plans}
          provider="stripe"
          selectedPlanId={selectedPlanId}
          onSelect={selectPlan}
          disabled={isCheckoutLoading}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handleCheckout("stripe", selectedPlanId ?? "")}
            disabled={isCheckoutLoading || !selectedPlanId}
          >
            {isCheckoutLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CreditCardIcon data-icon="inline-start" />
            )}
            {t("checkout")}
          </Button>
          <Button
            variant="outline"
            disabled={isCheckoutLoading}
            onClick={() => void handlePortal()}
            hidden={stripeSubs.length === 0}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            {t("customerPortal")}
          </Button>
          <Button variant="outline" onClick={() => void copySuccessUrl()}>
            <CopyIcon data-icon="inline-start" />
            {t("copySuccessUrl")}
          </Button>
        </div>
        {pastDue ? (
          <Alert>
            <AlertTitle>{t("paymentPastDue")}</AlertTitle>
            <AlertDescription className="max-w-[65ch]">
              {t("paymentPastDueDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        <BillingSubscriptionTable subscriptions={stripeSubs} plans={plans} loading={subsLoading} />
        <Separator />
        <StripeInvoices invoices={stripeInvs} />
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground">
        <p className="max-w-[70ch]">{t("stripeFlowDescription")}</p>
      </CardFooter>
    </Card>
  );
}
