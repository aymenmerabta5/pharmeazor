"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Last-resort route fallback.
 *
 * Known routes render their own page-shaped skeleton through `RouteSkeleton`.
 * This neutral shell is only used by a route that has not declared one yet.
 */
export function LoadingScreen(): React.JSX.Element {
  return (
    <PageSkeleton className="min-h-[calc(100dvh-4rem)] bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </PageSkeleton>
  );
}
