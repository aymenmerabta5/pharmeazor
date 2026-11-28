"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The storage workspace while its client controllers mount. */
export function StorageSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <section key={index} className="rounded-lg border bg-card">
            <div className="border-b p-5 sm:p-6">
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-24 w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </section>
        ))}
      </div>
    </PageSkeleton>
  );
}
