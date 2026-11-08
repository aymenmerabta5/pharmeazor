"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { StripePanel } from "./providers/stripe-panel";
import { ChargilyPanel } from "./providers/chargily-panel";
import type { BillingPageState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";
interface BillingTabsProps {
  providers: string[];
  billing: BillingPageState;
  paymentLink?: React.ReactNode;
}
export function BillingTabs({
  providers,
  billing,
  paymentLink,
}: BillingTabsProps): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const list = providers.length > 0 ? providers : (["stripe", "chargily"] as string[]);
  const hasChargily = list.includes("chargily");
  const hasGlobal = list.some((p) => ["stripe", "paddle", "polar"].includes(p));
  if (list.length === 1) {
    const only = list[0];
    const isChargilyAlone = hasChargily && list.length === 1;
    return (
      <div className="flex flex-col gap-6">
        {isChargilyAlone ? (
          <Alert>
            <AlertTitle>{t("algeriaMarketTitle")}</AlertTitle>
            <AlertDescription className="max-w-[70ch]">
              {t("algeriaMarketDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        {only === "stripe" ? <StripePanel billing={billing} /> : null}
        {only === "chargily" ? <ChargilyPanel billing={billing} paymentLink={paymentLink} /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {hasChargily && hasGlobal ? (
        <Alert className="border-primary/20 bg-primary/[0.04]">
          <AlertTitle>{t("dualMarketTitle")}</AlertTitle>
          <AlertDescription className="max-w-[75ch]">
            {t("dualMarketDescription", { providers: "stripe, chargily" })}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {hasChargily ? (
          <Badge variant="secondary">
            <span className="flex items-center gap-1.5">{t("algeriaCoverage")}</span>
          </Badge>
        ) : null}
        {hasGlobal ? (
          <Badge variant="secondary">
            <span className="flex items-center gap-1.5">
              {t("globalCoverage", { providers: "stripe" })}
            </span>
          </Badge>
        ) : null}
      </div>
      <Tabs defaultValue={list[0]} className="flex flex-col gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="stripe">{t("providerStripe")}</TabsTrigger>
          <TabsTrigger value="chargily">{t("providerChargily")}</TabsTrigger>
        </TabsList>
        <TabsContent value="stripe" className="flex flex-col gap-6">
          <StripePanel billing={billing} />
        </TabsContent>
        <TabsContent value="chargily" className="flex flex-col gap-6">
          <ChargilyPanel billing={billing} paymentLink={paymentLink} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
