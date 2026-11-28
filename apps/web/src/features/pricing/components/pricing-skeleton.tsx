"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The pricing page while the plan catalog and ownership load. */
export function PricingSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="ph-surface">
      <header className="ph-pricing-header">
        <Skeleton className="h-6 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </header>

      <main className="ph-pricing-main">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="mb-3 h-9 w-full max-w-[540px]" />
        <Skeleton className="mb-8 h-4 w-full max-w-[460px]" />
        <Skeleton className="mb-10 h-9 w-56 rounded-full" />
        <div className="grid w-full max-w-[900px] gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-80 rounded-xl" />
          ))}
        </div>
      </main>

      <footer className="ph-pricing-footer">
        <Skeleton className="mx-auto h-3 w-64 max-w-full" />
      </footer>
    </PageSkeleton>
  );
}
