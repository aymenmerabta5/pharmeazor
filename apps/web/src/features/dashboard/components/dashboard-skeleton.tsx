"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The dashboard's shell while the session and identity are read. */
export function DashboardSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-surface lg:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="space-y-7 p-6 sm:p-8">
            <div className="flex min-w-0 items-center gap-4">
              <Skeleton className="size-16 shrink-0 rounded-2xl" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-7 w-40 max-w-full" />
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-lg border bg-card p-6 shadow-surface lg:col-span-5">
          <Skeleton className="mb-5 h-4 w-20" />
          <div className="divide-y">
            {[0, 1].map((index) => (
              <div key={index} className="flex min-h-20 items-center gap-3 py-4">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <Skeleton className="h-4 w-36 max-w-full" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-surface">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="size-4 rounded-full" />
        </div>
      </div>
    </PageSkeleton>
  );
}
