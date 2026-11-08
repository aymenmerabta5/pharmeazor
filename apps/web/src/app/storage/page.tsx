import type { ComponentProps as GhostinitPageProps } from "react";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { StoragePage as GhostinitPageContent } from "@/features/storage/page";

export default function RequestLocalizedPage(
  props: GhostinitPageProps<typeof GhostinitPageContent> & object,
) {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <GhostinitPageContent {...props} />
    </>
  );
}
