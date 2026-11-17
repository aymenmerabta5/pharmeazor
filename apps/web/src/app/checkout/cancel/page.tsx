import type * as React from "react";
import { Suspense } from "react";
import { CheckoutReturnView } from "@/features/checkout/components/return-page";
import { CheckoutReturnLoading } from "@/features/checkout/components/skeletons";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function CancelData({ searchParams }: SearchProps): Promise<React.JSX.Element> {
  const rail = (await searchParams).rail;
  return (
    <CheckoutReturnView kind="cancelled" rail={(Array.isArray(rail) ? rail[0] : rail) ?? null} />
  );
}

export default function CheckoutCancelPage(props: SearchProps): React.JSX.Element {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <Suspense fallback={<CheckoutReturnLoading />}>
        <CancelData {...props} />
      </Suspense>
    </>
  );
}
