"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The account billing body while the plan, balance, and history load. */
export function BillingSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="flex flex-col gap-6">
      <BillingBodySkeleton />
    </PageSkeleton>
  );
}

/** The billing cards without their loading-status frame. */
export function BillingBodySkeleton(): React.JSX.Element {
  return (
    <>
      <header className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </header>

      <section className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-card to-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {[0, 1].map((index) => (
          <section key={index} className="rounded-lg border bg-card">
            <div className="space-y-2 border-b p-5 sm:p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-9 w-36" />
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border bg-card">
        <div className="space-y-2 border-b p-5 sm:p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-3 p-5 sm:p-6">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </section>
    </>
  );
}
