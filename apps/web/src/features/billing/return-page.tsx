import type * as React from "react";
import { BillingReturnView } from "./components/return-page";
export function BillingReturnPage({
  outcome,
}: {
  outcome: "success" | "cancel";
}): React.JSX.Element {
  return <BillingReturnView outcome={outcome} />;
}
