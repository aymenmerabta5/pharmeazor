import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { MagicLinkScreen } from "@/features/auth/magic-link-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <MagicLinkScreen />
    </>
  );
}
