"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { BillingCycle, PlanDefinition } from "../model";
import { BillingCycleToggle } from "./billing-cycle-toggle";
import { PlanCard } from "./plan-card";
import { PlansHeader } from "./plans-header";

export function PlansScreen({
  cycle,
  setCycle,
  plans,
  currentPlanId,
}: {
  cycle: BillingCycle;
  setCycle(cycle: BillingCycle): void;
  plans: readonly PlanDefinition[];
  currentPlanId: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("plans");
  return (
    <div className="agent-shell min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1160px] flex-col px-6 sm:px-10 xl:px-0">
        <PlansHeader />
        <main className="flex flex-1 flex-col items-center pb-8">
          <p className="mt-7 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 max-w-[620px] text-center text-[2.25rem] font-bold leading-[1.03] tracking-[-0.04em] [text-wrap:wrap] sm:text-[3rem]">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[560px] text-center text-base leading-7 text-muted-foreground">
            {t("description")}
          </p>
          <div className="mt-6">
            <BillingCycleToggle cycle={cycle} onChange={setCycle} />
          </div>
          <div className="mt-10 grid w-full max-w-[1140px] gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} cycle={cycle} currentPlanId={currentPlanId} />
            ))}
          </div>
        </main>
        <footer className="shrink-0 pb-12 pt-4 text-center text-xs leading-5 text-muted-foreground">
          {t("disclaimer")}
        </footer>
      </div>
    </div>
  );
}
