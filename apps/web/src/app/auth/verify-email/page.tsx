import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { VerifyEmailScreen } from "@/features/auth/verify-email-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <VerifyEmailScreen />
    </>
  );
}
