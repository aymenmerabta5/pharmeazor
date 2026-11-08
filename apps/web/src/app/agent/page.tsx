import type { ComponentProps as GhostinitPageProps } from "react";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { AgentPage as GhostinitPageContent } from "@/features/agent/page";

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
