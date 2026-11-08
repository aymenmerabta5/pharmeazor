import type { ComponentProps as GhostinitPageProps } from "react";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { PdfWorkspace as GhostinitPageContent } from "@/features/pdf/pdf-workspace";

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
