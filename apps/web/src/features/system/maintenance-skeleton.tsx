"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The maintenance notice while its translated copy resolves. */
export function MaintenanceSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-lg flex-col gap-4 px-5 py-10 sm:px-8 sm:py-14">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-5 h-14 w-full" />
    </PageSkeleton>
  );
}
