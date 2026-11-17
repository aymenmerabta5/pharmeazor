"use client";
import type * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { CheckoutOrderSummary } from "./components/order-summary";
import { CheckoutPaymentOptions } from "./components/payment-options";
import type { CheckoutOrder } from "./model";
import { useCheckout } from "./use-checkout";

/**
 * The checkout screen.
 *
 * The payment methods sit beside the order, so the amount and the way it is
 * paid are read together. The workflow lives in `useCheckout`; this file only
 * arranges what it returns.
 */
export function CheckoutScreen({ order }: { order: CheckoutOrder }): React.JSX.Element {
  const t = useSurfaceTranslations("checkout");
  const state = useCheckout(order);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-label={t("paymentMethods")}>
          <CheckoutPaymentOptions order={order} state={state} />
        </section>
        <aside className="flex min-w-0 flex-col gap-4">
          <CheckoutOrderSummary order={order} />
          <ul className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{t("includedAssistant")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{t("includedCancel")}</span>
            </li>
          </ul>
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("backToPricing")}
          </Link>
        </aside>
      </div>
    </div>
  );
}
