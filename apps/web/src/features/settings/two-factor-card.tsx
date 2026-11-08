"use client";
import type * as React from "react";
import { useTwoFactorSettings } from "./use-two-factor-settings";
import { TwoFactorView } from "./components/two-factor-view";
export function TwoFactorCard(): React.JSX.Element {
  const model = useTwoFactorSettings();
  return <TwoFactorView model={model} />;
}
