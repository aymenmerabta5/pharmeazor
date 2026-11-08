import type * as React from "react";
import { ActionsCard } from "./actions-card";
import { IdentityCard } from "./identity-card";
import type { DashboardIdentityState } from "../types";

export function IdentityActions({
  identity,
}: {
  identity: DashboardIdentityState;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <IdentityCard {...identity} />
      <ActionsCard />
    </div>
  );
}
