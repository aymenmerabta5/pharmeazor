import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { CheckoutScreen } from "@/features/checkout/checkout-screen";
import { CheckoutLoading } from "@/features/checkout/components/skeletons";
import { checkoutOrder } from "@/features/checkout/model";
import { normalizeBillingPlans } from "@/lib/billing-catalog";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * One order, resolved from the catalog.
 *
 * The link only names a plan. Its price, its period, and the rails that can
 * charge it are read here, so a tampered query string cannot buy a plan at a
 * price of the caller's choosing.
 */
async function CheckoutData({ searchParams }: SearchProps): Promise<React.JSX.Element> {
  const planId = first((await searchParams).plan) ?? "";
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  if (!me.user) redirect("/auth/sign-in");
  const [catalog, summary] = await Promise.all([
    application.billing.plans(),
    application.billing.manual.summary(),
  ]);
  const plan = normalizeBillingPlans(catalog.plans).find((entry) => entry.id === planId);
  if (!plan) redirect("/pricing");
  return <CheckoutScreen order={checkoutOrder(plan, summary.balanceMinor)} />;
}

export default function CheckoutPage(props: SearchProps): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<CheckoutLoading />}>
        <CheckoutData {...props} />
      </Suspense>
    </>
  );
}
