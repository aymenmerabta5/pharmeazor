import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { TwoFactorScreen } from "@/features/auth/two-factor-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <TwoFactorScreen />
    </>
  );
}
