import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { BillingReturnPage } from "@/features/billing/return-page";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <BillingReturnPage outcome="success" />
    </>
  );
}
