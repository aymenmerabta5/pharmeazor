"use client";
import type * as React from "react";
import { useAccountDeletion } from "./use-account-deletion";
import { DangerZoneView } from "./components/danger-zone-view";
export function DangerZoneCard(): React.JSX.Element {
  const model = useAccountDeletion();
  return <DangerZoneView model={model} />;
}
