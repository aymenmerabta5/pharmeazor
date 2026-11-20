import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { SignInScreen } from "@/features/auth/sign-in-screen";
export default function Page() {
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <SignInScreen />
    </>
  );
}
