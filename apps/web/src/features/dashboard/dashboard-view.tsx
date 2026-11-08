"use client";
import type * as React from "react";
import { ChevronDown } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { ArchitectureStatus } from "./components/architecture-status";
import { DashboardHeader } from "./components/dashboard-header";
import { IdentityActions } from "./components/identity-actions";
import { ModulesCard } from "./components/modules-card";
import type { DashboardUser } from "./types";
import { useDashboardIdentity } from "./queries";

export function DashboardView({ user }: { user: DashboardUser }): React.JSX.Element {
  const identity = useDashboardIdentity(user);
  const t = useSurfaceTranslations("dashboard");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <DashboardHeader />
      <IdentityActions identity={identity} />
      <details
        id="project-guide"
        className="group scroll-mt-24 rounded-lg border bg-card shadow-surface"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg p-6 text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {t("header.setupGuide")}
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-7 border-t p-6 sm:p-8">
          <ArchitectureStatus user={identity.user} />
          <ModulesCard />
        </div>
      </details>
    </div>
  );
}
