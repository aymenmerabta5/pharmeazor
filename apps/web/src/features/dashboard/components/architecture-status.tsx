import type * as React from "react";
import { ArchitectureCard } from "./architecture-card";
import { ChecksCard } from "./checks-card";
import type { DashboardUser } from "../types";

export function ArchitectureStatus({
  user,
}: {
  user: DashboardUser | null | undefined;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <ArchitectureCard />
      <ChecksCard user={user} />
    </div>
  );
}
