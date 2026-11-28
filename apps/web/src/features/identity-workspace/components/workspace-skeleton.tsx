"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The organizations/teams workspace while permissions and membership load. */
export function WorkspaceSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="flex flex-col gap-6">
      <WorkspaceBodySkeleton />
    </PageSkeleton>
  );
}

/** The workspace cards without their loading-status frame. */
export function WorkspaceBodySkeleton(): React.JSX.Element {
  return (
    <>
      <div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <section className="rounded-lg border bg-card">
          <div className="space-y-2 border-b p-5 sm:p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-xs" />
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-6">
          {[0, 1, 2].map((index) => (
            <section key={index} className="rounded-lg border bg-card">
              <div className="space-y-2 border-b p-5 sm:p-6">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full max-w-sm" />
              </div>
              <div className="space-y-3 p-5 sm:p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
