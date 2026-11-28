"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The sign-in and sign-up shell while their form controllers mount. */
export function AuthSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden bg-background px-5 py-12 sm:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 end-[-10rem] size-[28rem] rounded-full bg-accent/70 blur-3xl" />
        <div className="absolute -bottom-48 start-[-12rem] size-[32rem] rounded-full bg-secondary/80 blur-3xl" />
      </div>
      <div className="relative z-10 flex w-full max-w-[430px] flex-col gap-5">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <div className="space-y-4">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mx-auto h-3 w-full max-w-[48ch]" />
      </div>
    </PageSkeleton>
  );
}

/** The start-aligned recovery and email-verification card. */
export function AuthCardSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    </PageSkeleton>
  );
}

/** The two-factor challenge while its form controller mounts. */
export function TwoFactorSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-12" />
              ))}
            </div>
          </div>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="mx-auto h-3 w-full max-w-[48ch]" />
      </div>
    </PageSkeleton>
  );
}
