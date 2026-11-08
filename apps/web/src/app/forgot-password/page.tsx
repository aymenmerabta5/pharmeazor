import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { ForgotPasswordScreen } from "@/features/auth/forgot-password-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <ForgotPasswordScreen />
    </>
  );
}
