import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { SignUpScreen } from "@/features/auth/sign-up-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <SignUpScreen />
    </>
  );
}
