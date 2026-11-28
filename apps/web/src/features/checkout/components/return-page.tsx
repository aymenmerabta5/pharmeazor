"use client";
import type * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * What the customer sees after leaving a payment rail.
 *
 * A card checkout confirms at the provider, so success means the payment was
 * submitted, not that access is already granted. A balance purchase completes
 * here, so its copy says the plan is active.
 */
export function CheckoutReturnView({
  kind,
  rail,
}: {
  kind: "success" | "cancelled";
  rail: string | null;
}): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  const succeeded = kind === "success";
  const byBalance = succeeded && rail === "balance";
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-14 sm:px-6">
      <Card>
        <CardHeader className="items-start gap-3">
          <span
            className={
              succeeded
                ? "flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary"
                : "flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
            }
          >
            {succeeded ? (
              <CheckCircle2 className="size-5" aria-hidden />
            ) : (
              <XCircle className="size-5" aria-hidden />
            )}
          </span>
          <CardTitle as="h1" className="text-xl">
            {succeeded
              ? byBalance
                ? t("successBalanceTitle")
                : t("successTitle")
              : t("cancelTitle")}
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            {succeeded
              ? byBalance
                ? t("successBalanceDescription")
                : t("successDescription")
              : t("cancelDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button render={<Link href={succeeded ? "/" : "/pricing"} />} nativeButton={false}>
            {succeeded ? t("startChatting") : t("backToPricing")}
          </Button>
          <Button
            variant="outline"
            render={<Link href={succeeded ? "/settings/billing" : "/pricing"} />}
            nativeButton={false}
          >
            {succeeded ? t("viewBilling") : t("backToPricing")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
