"use client";
import type * as React from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SurfaceMessageKey } from "@/lib/translations";
import type { CheckoutOrder } from "../model";
import type { CheckoutFailure, CheckoutState } from "../use-checkout";
import { CheckoutBalanceOption } from "./balance-option";
import { CheckoutRailOptions } from "./rail-options";

function failureMessage(failure: CheckoutFailure): SurfaceMessageKey<"checkout"> {
  if (failure === "railUnavailable") return "railUnavailable";
  if (failure === "balanceShort") return "balanceShort";
  if (failure === "balanceUnavailable") return "balanceUnavailable";
  return "checkoutFailed";
}

/** Every way this order can be paid, in the order a customer should read them. */
export function CheckoutPaymentOptions({
  order,
  state,
}: {
  order: CheckoutOrder;
  state: CheckoutState;
}): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  return (
    <div className="flex flex-col gap-6">
      {state.failure ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(failureMessage(state.failure))}</AlertDescription>
        </Alert>
      ) : null}
      {order.balance ? (
        <CheckoutBalanceOption
          balance={order.balance}
          pending={state.pendingRail === "balance"}
          onPay={() => void state.payWithBalance()}
        />
      ) : null}
      <CheckoutRailOptions
        rails={order.rails}
        pendingRail={state.pendingRail}
        onStart={(rail) => void state.start(rail)}
      />
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            {t("payByTransfer")}
          </CardTitle>
          <CardDescription>{t("payByTransferDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/billing#topup"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("goToTopup")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
