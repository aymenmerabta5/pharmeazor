"use client";
import type * as React from "react";
import { PlansScreen } from "./components/plans-screen";
import { usePlans } from "./use-plans";

export function PlansPage(): React.JSX.Element {
  const plans = usePlans();
  return <PlansScreen {...plans} />;
}
