import type * as React from "react";
import { useLocalSearchParams } from "expo-router";
import { TwoFactorScreen } from "@/features/auth/two-factor-screen";
export default function TwoFactorRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ totpURI?: string | string[] }>();
  const totpUri = typeof params.totpURI === "string" ? params.totpURI : (params.totpURI?.[0] ?? "");
  return <TwoFactorScreen totpUri={totpUri} />;
}
