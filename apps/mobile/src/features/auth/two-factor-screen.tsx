import type * as React from "react";
import { useTwoFactorForm } from "./use-two-factor-form";
import { TwoFactorForm } from "./components/two-factor-form";
export function TwoFactorScreen({ totpUri }: { totpUri: string }): React.JSX.Element {
  const state = useTwoFactorForm();
  return <TwoFactorForm state={state} totpUri={totpUri} />;
}
